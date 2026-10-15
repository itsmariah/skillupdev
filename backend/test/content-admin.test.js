// Conteúdo no banco gerenciado pelo admin: semente, rascunho, publicação, versões e arquivo.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
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
let admin;
let user;

async function api(method, url, { body, session } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, headers: response.headers };
}

const sessionOf = (response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];

const openContent = (overrides = {}) => ({
  categoria: "Comunicação",
  dificuldade: "basico",
  habilidades: ["clareza-objetividade", "empatia"],
  titulo: "Reunião Atrasada",
  pergunta: "A reunião com o cliente começou e o time ainda não chegou. O que você diz?",
  descricao: "Explique como conduziria os primeiros minutos.",
  ...overrides,
});

test.before(async () => {
  await db.initDatabase();
  await db.insertUser({
    id: crypto.randomUUID(),
    nome: "Admin",
    email: "admin@conteudo.com",
    passwordHash: createPasswordHash("admin-senha"),
    role: "admin",
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
  });
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;

  admin = sessionOf(
    await api("POST", "/api/auth/login", {
      body: { email: "admin@conteudo.com", senha: "admin-senha" },
    }),
  );
  user = sessionOf(
    await api("POST", "/api/auth/register", {
      body: { nome: "Pessoa", email: "pessoa@conteudo.com", senha: "senha123", aceiteTermos: true },
    }),
  );
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

const userChallenges = async () =>
  (await api("GET", "/api/challenges", { session: user })).data.challenges;

test("a semente grava os 30 desafios como versão 1 publicada", async () => {
  const { status, data } = await api("GET", "/api/admin/challenges", { session: admin });

  assert.equal(status, 200);
  assert.equal(data.challenges.length, 30);
  assert.ok(
    data.challenges.every((item) => item.status === "publicado" && item.publishedVersion === 1),
  );
  assert.equal(data.competencias.length, 10);
  assert.equal((await userChallenges()).length, 30);
});

test("só o admin gerencia conteúdo", async () => {
  assert.equal((await api("GET", "/api/admin/challenges", { session: user })).status, 403);
  assert.equal(
    (
      await api("POST", "/api/admin/challenges", {
        session: user,
        body: { tipo: "aberto", content: openContent() },
      })
    ).status,
    403,
  );
});

test("conteúdo inválido é recusado com a lista de erros", async () => {
  const { status, data } = await api("POST", "/api/admin/challenges", {
    session: admin,
    body: {
      tipo: "fechado",
      content: {
        ...openContent({ habilidades: ["nao-existe"] }),
        respostas: [
          { texto: "A", xp: 100, feedback: "ok" },
          { texto: "B", xp: 100, feedback: "ok" },
        ],
      },
    },
  });

  assert.equal(status, 400);
  assert.ok(data.errors.some((error) => error.startsWith("Alternativas")));
  assert.ok(data.errors.some((error) => error.includes("nao-existe")));
  assert.ok(data.errors.some((error) => error.startsWith("Dificuldade")) === false);

  const noLevel = await api("POST", "/api/admin/challenges", {
    session: admin,
    body: { tipo: "aberto", content: { ...openContent(), dificuldade: "facil" } },
  });
  assert.ok(noLevel.data.errors.some((error) => error.startsWith("Dificuldade")));
});

let createdId;

test("desafio novo nasce como rascunho e só aparece depois de publicado", async () => {
  const created = await api("POST", "/api/admin/challenges", {
    session: admin,
    body: { tipo: "aberto", content: openContent() },
  });
  assert.equal(created.status, 201);
  createdId = created.data.challenge.id;
  assert.match(createdId, /^reuniao-atrasada-[a-z0-9]{4}$/);
  assert.equal(created.data.challenge.status, "rascunho");
  assert.ok(!(await userChallenges()).some((item) => item.id === createdId));

  const published = await api("POST", `/api/admin/challenges/${createdId}/publish`, {
    session: admin,
  });
  assert.equal(published.data.challenge.status, "publicado");
  assert.equal(published.data.challenge.publishedVersion, 1);

  const listed = (await userChallenges()).find((item) => item.id === createdId);
  assert.equal(listed.titulo, "Reunião Atrasada");
  assert.equal(listed.dificuldade, "basico");
  assert.deepEqual(
    listed.habilidades.map((skill) => skill.id),
    ["clareza-objetividade", "empatia"],
  );
});

test("editar um publicado cria a versão 2; quem respondeu a 1 continua vendo a 1", async () => {
  const answer = await api("POST", `/api/challenges/${createdId}/submit`, {
    session: user,
    body: {
      texto:
        "Eu cumprimentaria o cliente, explicaria o atraso com clareza e proporia começar pela pauta.",
    },
  });
  assert.equal(answer.status, 200);

  const draft = await api("PUT", `/api/admin/challenges/${createdId}/draft`, {
    session: admin,
    body: { content: openContent({ titulo: "Reunião Atrasada (revisada)" }) },
  });
  assert.equal(draft.data.challenge.draft.version, 2);
  assert.equal(draft.data.challenge.publishedVersion, 1);
  assert.equal(
    (await userChallenges()).find((item) => item.id === createdId).titulo,
    "Reunião Atrasada",
  );

  await api("POST", `/api/admin/challenges/${createdId}/publish`, { session: admin });
  const current = (await userChallenges()).find((item) => item.id === createdId);
  assert.equal(current.titulo, "Reunião Atrasada (revisada)");
  assert.equal(current.completed, true);

  const history = await api("GET", "/api/me/history", { session: user });
  assert.equal(history.data.items[0].titulo, "Reunião Atrasada");

  const versions = (await api("GET", `/api/admin/challenges/${createdId}`, { session: admin })).data
    .challenge.versions;
  assert.deepEqual(
    versions.map((version) => [version.version, version.isPublished]),
    [
      [2, true],
      [1, false],
    ],
  );
});

test("arquivar tira o desafio da lista e do total, mas mantém o histórico", async () => {
  const before = (await api("GET", "/api/me", { session: user })).data.user.totalChallenges;

  const archived = await api("POST", `/api/admin/challenges/${createdId}/archive`, {
    session: admin,
  });
  assert.equal(archived.data.challenge.status, "arquivado");
  assert.ok(!(await userChallenges()).some((item) => item.id === createdId));
  assert.equal(
    (await api("GET", "/api/me", { session: user })).data.user.totalChallenges,
    before - 1,
  );
  assert.ok(
    (await api("GET", "/api/me/history", { session: user })).data.items.some(
      (item) => item.challengeId === createdId,
    ),
  );

  await api("POST", `/api/admin/challenges/${createdId}/unarchive`, { session: admin });
  assert.ok((await userChallenges()).some((item) => item.id === createdId));
});

test("descartar o rascunho de um desafio nunca publicado o remove", async () => {
  const created = await api("POST", "/api/admin/challenges", {
    session: admin,
    body: { tipo: "aberto", content: openContent({ titulo: "Descartável" }) },
  });
  const id = created.data.challenge.id;

  const discarded = await api("DELETE", `/api/admin/challenges/${id}/draft`, { session: admin });
  assert.equal(discarded.status, 200);
  assert.equal((await api("GET", `/api/admin/challenges/${id}`, { session: admin })).status, 404);
});

test("o painel avisa quais badges dependem de um desafio", async () => {
  const { data } = await api("GET", "/api/admin/challenges/teamwork-closed-2", { session: admin });
  assert.deepEqual(
    data.challenge.badgesDependentes.map((badge) => badge.id),
    ["conflict-mediator"],
  );
});
