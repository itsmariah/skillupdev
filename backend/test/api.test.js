// Testes de integração da API contra um PostgreSQL embutido (PGlite em memória).
// As variáveis abaixo são definidas antes de carregar a aplicação: o dotenv não sobrescreve
// valores já definidos, então os testes nunca usam o banco nem os serviços reais do .env.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
  EMAIL_PROVIDER: "",
  RESEND_API_KEY: "",
  ALLOW_RESET_PREVIEW: "false",
  // Liga o estudo piloto para exercitar os questionários (o padrão é desligado,
  // coberto em study-disabled.test.js).
  STUDY_ENABLED: "true",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const app = require("../src/app");
const db = require("../src/db");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const { createPasswordHash } = require("../src/services/auth");
const { DEFAULT_AVATAR, createDefaultGamificationState } = require("../src/services/gamification");

let server;
let baseUrl;

test.before(async () => {
  await db.initDatabase();
  await db.insertUser({
    id: crypto.randomUUID(),
    nome: "Administrador",
    email: "admin@teste.com",
    passwordHash: createPasswordHash("admin-senha"),
    role: "admin",
    xp: 0,
    nivel: 1,
    badges: [],
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
  });

  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

// `session` é o cookie de sessão ("nome=valor") devolvido por login/cadastro.
async function api(method, url, { body, session, headers = {} } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    // CSV e páginas estáticas não são JSON.
  }
  return { status: response.status, data, headers: response.headers };
}

function sessionCookieOf(response) {
  const header = response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return header ? header.split(";")[0] : null;
}

// Atenção: as rotas de autenticação têm limites por IP e por conta (ver
// src/middleware/rateLimits.js), e todos os testes deste arquivo compartilham esses contadores.
let userSession;
let userId;

test("cadastro cria conta, sessão e bônus de login diário", async () => {
  const response = await api("POST", "/api/auth/register", {
    body: { nome: "Dev Teste", email: "Dev@Teste.com", senha: "senha123" },
  });
  const { status, data } = response;

  assert.equal(status, 201);
  assert.equal(data.token, undefined);
  assert.equal(data.user.email, "dev@teste.com");
  assert.equal(data.user.role, "user");
  assert.equal("isAdmin" in data.user, false);
  assert.equal(data.dailyLoginReward.xp, 20);
  assert.equal(data.user.xp, 20);

  userSession = sessionCookieOf(response);
  assert.ok(userSession);

  const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  userId = data.user.id;
});

test("cadastro com e-mail já usado é recusado", async () => {
  const { status } = await api("POST", "/api/auth/register", {
    body: { nome: "Outro", email: "dev@teste.com", senha: "senha123" },
  });
  assert.equal(status, 409);
});

test("configuração pública reflete o estudo ligado", async () => {
  const { status, data } = await api("GET", "/api/config");
  assert.equal(status, 200);
  assert.deepEqual(data, { features: { study: true } });
});

test("rotas autenticadas exigem sessão válida", async () => {
  assert.equal((await api("GET", "/api/me")).status, 401);
  assert.equal(
    (await api("GET", "/api/me", { session: `${SESSION_COOKIE}=invalido` })).status,
    401,
  );
  assert.equal((await api("GET", "/api/me", { session: userSession })).status, 200);
  assert.equal((await api("GET", "/api/admin/study-data", { session: userSession })).status, 403);
});

test("alterações vindas de outro site são recusadas (CSRF)", async () => {
  const body = { avatarConfig: DEFAULT_AVATAR };
  const crossSite = await api("PATCH", "/api/me/avatar", {
    session: userSession,
    body,
    headers: { Origin: "https://site-malicioso.exemplo" },
  });
  assert.equal(crossSite.status, 403);

  const sameSite = await api("PATCH", "/api/me/avatar", {
    session: userSession,
    body,
    headers: { Origin: baseUrl },
  });
  assert.equal(sameSite.status, 200);
});

test("lista de desafios não expõe a resposta certa", async () => {
  const { status, data } = await api("GET", "/api/challenges", { session: userSession });

  assert.equal(status, 200);
  assert.equal(data.challenges.length, 30);
  for (const challenge of data.challenges.filter((item) => item.tipo === "fechado")) {
    for (const answer of challenge.respostas) {
      assert.deepEqual(Object.keys(answer).sort(), ["id", "texto"]);
    }
  }
});

test("desafio fechado ideal soma XP e desbloqueia a primeira badge", async () => {
  const { status, data } = await api("POST", "/api/challenges/communication-closed-1/submit", {
    session: userSession,
    body: { respostaId: "b" },
  });

  assert.equal(status, 200);
  assert.equal(data.result.qualityTier, "ideal");
  assert.equal(data.result.xpGanho, 100);
  assert.equal(data.result.evaluator, "closed");
  assert.deepEqual(
    data.result.unlockedBadges.map((badge) => badge.id),
    ["first-mission"],
  );
  assert.equal(data.user.xp, 20 + 100 + 50);
  assert.equal(data.user.completedChallenges, 1);
});

test("o mesmo desafio não pode ser respondido duas vezes", async () => {
  const { status, data } = await api("POST", "/api/challenges/communication-closed-1/submit", {
    session: userSession,
    body: { respostaId: "a" },
  });

  assert.equal(status, 409);
  assert.equal(data.result.xpGanho, 100);
});

test("envios simultâneos do mesmo desafio contam uma vez só", async () => {
  const responses = await Promise.all(
    [1, 2, 3].map(() =>
      api("POST", "/api/challenges/communication-closed-2/submit", {
        session: userSession,
        body: { respostaId: "b" },
      }),
    ),
  );

  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 2);

  const attempts = await db.listAttemptsByUser(userId);
  assert.equal(
    attempts.filter((attempt) => attempt.challengeId === "communication-closed-2").length,
    1,
  );
});

test("o banco recusa uma segunda tentativa do mesmo desafio (restrição única)", async () => {
  const [existing] = await db.listAttemptsByUser(userId);

  await assert.rejects(
    () => db.insertAttempt({ ...existing, id: crypto.randomUUID() }),
    (error) => db.isUniqueViolation(error),
  );
});

test("desafio aberto sem IA configurada usa a avaliação heurística", async () => {
  const { status, data } = await api("POST", "/api/challenges/communication-open-1/submit", {
    session: userSession,
    body: {
      texto:
        "Entendo a frustração do cliente, vou explicar com clareza o impacto, alinhar com a equipe e resolver priorizando o que é mais urgente.",
    },
  });

  assert.equal(status, 200);
  assert.ok(data.result.nota >= 35 && data.result.nota <= 100);
  assert.ok(data.result.feedback);
  assert.equal(data.result.evaluator, "heuristic");

  const stored = await db.findAttempt(userId, "communication-open-1");
  assert.equal(stored.evaluator, "heuristic");
  assert.equal(stored.evaluation.fallbackReason, "OPENAI_API_KEY não configurada");
});

test("resposta aberta curta demais é recusada sem gravar nada", async () => {
  const before = (await db.listAttemptsByUser(userId)).length;
  const { status } = await api("POST", "/api/challenges/communication-open-2/submit", {
    session: userSession,
    body: { texto: "curta" },
  });

  assert.equal(status, 400);
  assert.equal((await db.listAttemptsByUser(userId)).length, before);
});

test("avatar com item bloqueado volta para o padrão liberado", async () => {
  const { status, data } = await api("PATCH", "/api/me/avatar", {
    session: userSession,
    body: { avatarConfig: { ...DEFAULT_AVATAR, cabelo: "spiky" } },
  });

  assert.equal(status, 200);
  assert.equal(data.user.avatarConfig.cabelo, "short");
});

test("questionário do estudo: pré uma vez só; pós exige 10 desafios", async () => {
  const post = await api("POST", "/api/study/questionnaire", {
    session: userSession,
    body: { type: "post", data: { sus: {} } },
  });
  assert.equal(post.status, 403);

  const pre = await api("POST", "/api/study/questionnaire", {
    session: userSession,
    body: { type: "pre", data: { curso: "CC" } },
  });
  assert.equal(pre.status, 200);
  assert.equal(pre.data.user.studyPreDone, true);

  const again = await api("POST", "/api/study/questionnaire", {
    session: userSession,
    body: { type: "pre", data: { curso: "CC" } },
  });
  assert.equal(again.status, 409);
});

test("esqueci a senha responde igual para e-mail cadastrado ou não", async () => {
  const existing = await api("POST", "/api/auth/forgot-password", {
    body: { email: "dev@teste.com" },
  });
  const missing = await api("POST", "/api/auth/forgot-password", {
    body: { email: "nao@existe.com" },
  });

  assert.equal(existing.status, 200);
  assert.deepEqual(existing.data, missing.data);
});

test("redefinição de senha: link de uso único que derruba as sessões", async () => {
  process.env.ALLOW_RESET_PREVIEW = "true";
  const forgot = await api("POST", "/api/auth/forgot-password", {
    body: { email: "dev@teste.com" },
  });
  process.env.ALLOW_RESET_PREVIEW = "false";

  const resetToken = new URL(forgot.data.previewResetUrl).searchParams.get("token");

  const validation = await api("GET", `/api/auth/reset-password/validate?token=${resetToken}`);
  assert.equal(validation.status, 200);
  assert.equal(validation.data.emailHint, "de*@teste.com");

  const reset = await api("POST", "/api/auth/reset-password", {
    body: { token: resetToken, senha: "nova-senha" },
  });
  assert.equal(reset.status, 200);

  assert.equal((await api("GET", "/api/me", { session: userSession })).status, 401);

  const reuse = await api("POST", "/api/auth/reset-password", {
    body: { token: resetToken, senha: "outra-senha" },
  });
  assert.equal(reuse.status, 400);
});

test("login com a senha nova mantém o progresso e logout encerra a sessão", async () => {
  const login = await api("POST", "/api/auth/login", {
    body: { email: "dev@teste.com", senha: "nova-senha" },
  });

  assert.equal(login.status, 200);
  assert.equal(login.data.dailyLoginReward, null);
  assert.equal(login.data.user.completedChallenges, 3);

  userSession = sessionCookieOf(login);
  const logout = await api("POST", "/api/auth/logout", { session: userSession });
  assert.equal(logout.status, 200);
  assert.match(sessionCookieOf(logout), new RegExp(`^${SESSION_COOKIE}=$`));
  assert.equal((await api("GET", "/api/me", { session: userSession })).status, 401);
});

test("painel admin: acesso restrito, dados do estudo, CSV e exclusão em cascata", async () => {
  const admin = await api("POST", "/api/auth/login", {
    body: { email: "admin@teste.com", senha: "admin-senha" },
  });
  const adminSession = sessionCookieOf(admin);
  assert.equal(admin.data.user.role, "admin");

  const studyData = await api("GET", "/api/admin/study-data", { session: adminSession });
  assert.equal(studyData.status, 200);
  assert.equal(studyData.data.summary.preCompletedCount, 1);
  assert.equal(studyData.data.participants[0].challengesCompleted, 3);

  const csv = await api("GET", "/api/admin/study-data/export", { session: adminSession });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);

  const deleteAdmin = await api("DELETE", `/api/admin/users/${admin.data.user.id}`, {
    session: adminSession,
  });
  assert.equal(deleteAdmin.status, 403);

  const deleteUser = await api("DELETE", `/api/admin/users/${userId}`, { session: adminSession });
  assert.equal(deleteUser.status, 200);
  assert.equal(await db.findUserById(userId), null);
  assert.deepEqual(await db.listAttemptsByUser(userId), []);
  assert.equal(await db.findStudyResponse(userId, "pre"), null);
});

test("login bloqueia a conta após 5 senhas erradas, mesmo com a senha certa", async () => {
  const credentials = (senha) => ({ body: { email: "admin@teste.com", senha } });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal((await api("POST", "/api/auth/login", credentials("errada"))).status, 401);
  }

  const blocked = await api("POST", "/api/auth/login", credentials("admin-senha"));
  assert.equal(blocked.status, 429);
  assert.ok(blocked.data.message);

  // O bloqueio é da conta: outra conta, do mesmo IP, continua entrando.
  const other = await api("POST", "/api/auth/login", {
    body: { email: "outra@teste.com", senha: "qualquer" },
  });
  assert.equal(other.status, 401);
});
