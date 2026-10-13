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
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const app = require("../src/app");
const db = require("../src/db");
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
    isAdmin: true,
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

async function api(method, url, { body, token } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

// Atenção: as rotas de autenticação têm limite de 10 requisições por IP a cada 15 minutos,
// e todos os testes deste arquivo compartilham esse limite.
let userToken;
let userId;

test("cadastro cria conta, sessão e bônus de login diário", async () => {
  const { status, data } = await api("POST", "/api/auth/register", {
    body: { nome: "Dev Teste", email: "Dev@Teste.com", senha: "senha123" },
  });

  assert.equal(status, 201);
  assert.ok(data.token);
  assert.equal(data.user.email, "dev@teste.com");
  assert.equal(data.dailyLoginReward.xp, 20);
  assert.equal(data.user.xp, 20);

  userToken = data.token;
  userId = data.user.id;
});

test("cadastro com e-mail já usado é recusado", async () => {
  const { status } = await api("POST", "/api/auth/register", {
    body: { nome: "Outro", email: "dev@teste.com", senha: "senha123" },
  });
  assert.equal(status, 409);
});

test("rotas autenticadas exigem token válido", async () => {
  assert.equal((await api("GET", "/api/me")).status, 401);
  assert.equal((await api("GET", "/api/me", { token: "invalido" })).status, 401);
  assert.equal((await api("GET", "/api/me", { token: userToken })).status, 200);
  assert.equal((await api("GET", "/api/admin/study-data", { token: userToken })).status, 403);
});

test("lista de desafios não expõe a resposta certa", async () => {
  const { status, data } = await api("GET", "/api/challenges", { token: userToken });

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
    token: userToken,
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
    token: userToken,
    body: { respostaId: "a" },
  });

  assert.equal(status, 409);
  assert.equal(data.result.xpGanho, 100);
});

test("envios simultâneos do mesmo desafio contam uma vez só", async () => {
  const responses = await Promise.all(
    [1, 2, 3].map(() =>
      api("POST", "/api/challenges/communication-closed-2/submit", {
        token: userToken,
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
    token: userToken,
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
    token: userToken,
    body: { texto: "curta" },
  });

  assert.equal(status, 400);
  assert.equal((await db.listAttemptsByUser(userId)).length, before);
});

test("avatar com item bloqueado volta para o padrão liberado", async () => {
  const { status, data } = await api("PATCH", "/api/me/avatar", {
    token: userToken,
    body: { avatarConfig: { ...DEFAULT_AVATAR, cabelo: "spiky" } },
  });

  assert.equal(status, 200);
  assert.equal(data.user.avatarConfig.cabelo, "short");
});

test("questionário do estudo: pré uma vez só; pós exige 10 desafios", async () => {
  const post = await api("POST", "/api/study/questionnaire", {
    token: userToken,
    body: { type: "post", data: { sus: {} } },
  });
  assert.equal(post.status, 403);

  const pre = await api("POST", "/api/study/questionnaire", {
    token: userToken,
    body: { type: "pre", data: { curso: "CC" } },
  });
  assert.equal(pre.status, 200);
  assert.equal(pre.data.user.studyPreDone, true);

  const again = await api("POST", "/api/study/questionnaire", {
    token: userToken,
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

  assert.equal((await api("GET", "/api/me", { token: userToken })).status, 401);

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

  userToken = login.data.token;
  assert.equal((await api("POST", "/api/auth/logout", { token: userToken })).status, 200);
  assert.equal((await api("GET", "/api/me", { token: userToken })).status, 401);
});

test("painel admin: acesso restrito, dados do estudo, CSV e exclusão em cascata", async () => {
  const admin = await api("POST", "/api/auth/login", {
    body: { email: "admin@teste.com", senha: "admin-senha" },
  });
  const adminToken = admin.data.token;

  const studyData = await api("GET", "/api/admin/study-data", { token: adminToken });
  assert.equal(studyData.status, 200);
  assert.equal(studyData.data.summary.preCompletedCount, 1);
  assert.equal(studyData.data.participants[0].challengesCompleted, 3);

  const csv = await api("GET", "/api/admin/study-data/export", { token: adminToken });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);

  const deleteAdmin = await api("DELETE", `/api/admin/users/${admin.data.user.id}`, {
    token: adminToken,
  });
  assert.equal(deleteAdmin.status, 403);

  const deleteUser = await api("DELETE", `/api/admin/users/${userId}`, { token: adminToken });
  assert.equal(deleteUser.status, 200);
  assert.equal(await db.findUserById(userId), null);
  assert.deepEqual(await db.listAttemptsByUser(userId), []);
  assert.equal(await db.findStudyResponse(userId, "pre"), null);
});
