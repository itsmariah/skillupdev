// Página de conta: perfil, troca de senha, exportação dos dados e exclusão da conta.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
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
let session;
let userId;

test.before(async () => {
  await db.initDatabase();
  await db.insertUser({
    id: crypto.randomUUID(),
    nome: "Administrador",
    email: "admin@conta.com",
    passwordHash: createPasswordHash("admin-senha"),
    role: "admin",
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
  });
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;

  const response = await api("POST", "/api/auth/register", {
    body: { nome: "Pessoa Conta", email: "pessoa@conta.com", senha: "senha123" },
  });
  session = sessionOf(response);
  userId = response.data.user.id;
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

async function api(method, url, { body, session } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    // resposta sem corpo JSON
  }
  return { status: response.status, data, headers: response.headers };
}

const sessionOf = (response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];

async function login(email, senha) {
  const response = await api("POST", "/api/auth/login", { body: { email, senha } });
  assert.equal(response.status, 200);
  return sessionOf(response);
}

test("perfil: troca o nome e recusa nome vazio", async () => {
  const empty = await api("PATCH", "/api/me/profile", { session, body: { nome: "   " } });
  assert.equal(empty.status, 400);

  const updated = await api("PATCH", "/api/me/profile", {
    session,
    body: { nome: "  Novo Nome  " },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.user.nome, "Novo Nome");
  assert.ok(updated.data.user.createdAt);
  assert.equal((await db.findUserById(userId)).nome, "Novo Nome");
});

test("troca de senha exige a senha atual e encerra só as outras sessões", async () => {
  const otherDevice = await login("pessoa@conta.com", "senha123");

  const wrong = await api("POST", "/api/me/password", {
    session,
    body: { senhaAtual: "errada", novaSenha: "nova-senha" },
  });
  assert.equal(wrong.status, 403);

  const short = await api("POST", "/api/me/password", {
    session,
    body: { senhaAtual: "senha123", novaSenha: "123" },
  });
  assert.equal(short.status, 400);

  const changed = await api("POST", "/api/me/password", {
    session,
    body: { senhaAtual: "senha123", novaSenha: "nova-senha" },
  });
  assert.equal(changed.status, 200);

  assert.equal((await api("GET", "/api/me", { session })).status, 200);
  assert.equal((await api("GET", "/api/me", { session: otherDevice })).status, 401);
  assert.equal(
    (
      await api("POST", "/api/auth/login", {
        body: { email: "pessoa@conta.com", senha: "senha123" },
      })
    ).status,
    401,
  );
  session = await login("pessoa@conta.com", "nova-senha");
});

test("exportação traz conta, progresso, tentativas e estudo, sem segredos", async () => {
  await api("POST", "/api/challenges/communication-closed-1/submit", {
    session,
    body: { respostaId: "b" },
  });
  await api("POST", "/api/study/questionnaire", {
    session,
    body: { type: "pre", data: { curso: "CC" } },
  });

  const { status, data, headers } = await api("GET", "/api/me/export", { session });

  assert.equal(status, 200);
  assert.match(headers.get("content-disposition"), /attachment; filename=skillupdev-meus-dados-/);
  assert.equal(data.conta.email, "pessoa@conta.com");
  assert.equal(data.conta.nome, "Novo Nome");
  assert.equal(data.tentativas.length, 1);
  assert.equal(data.tentativas[0].desafio.id, "communication-closed-1");
  assert.ok(data.tentativas[0].desafio.titulo);
  assert.deepEqual(data.estudoPiloto[0].respostas, { curso: "CC" });
  assert.ok(data.progresso.xp > 0);

  const raw = JSON.stringify(data);
  assert.doesNotMatch(raw, /passwordHash|password_hash|tokenHash|token_hash/);
});

test("exclusão exige a senha, apaga tudo em cascata e encerra a sessão", async () => {
  const wrong = await api("DELETE", "/api/me", { session, body: { senha: "errada" } });
  assert.equal(wrong.status, 403);
  assert.ok(await db.findUserById(userId));

  const deleted = await api("DELETE", "/api/me", { session, body: { senha: "nova-senha" } });
  assert.equal(deleted.status, 200);
  assert.match(sessionOf(deleted), new RegExp(`^${SESSION_COOKIE}=$`));

  assert.equal(await db.findUserById(userId), null);
  assert.deepEqual(await db.listAttemptsByUser(userId), []);
  assert.deepEqual(await db.listStudyResponsesByUser(userId), []);
  assert.equal((await api("GET", "/api/me", { session })).status, 401);
});

test("administrador não exclui a própria conta por esta rota", async () => {
  const adminSession = await login("admin@conta.com", "admin-senha");
  const response = await api("DELETE", "/api/me", {
    session: adminSession,
    body: { senha: "admin-senha" },
  });
  assert.equal(response.status, 403);
  assert.ok(await db.findUserByEmail("admin@conta.com"));
});

test("senha errada repetida bloqueia as ações protegidas da conta", async () => {
  const response = await api("POST", "/api/auth/register", {
    body: { nome: "Insistente", email: "insistente@conta.com", senha: "senha123" },
  });
  const insistent = sessionOf(response);
  const attempt = () =>
    api("POST", "/api/me/password", {
      session: insistent,
      body: { senhaAtual: "errada", novaSenha: "outra-senha" },
    });

  for (let index = 0; index < 5; index += 1) {
    assert.equal((await attempt()).status, 403);
  }
  assert.equal((await attempt()).status, 429);
});
