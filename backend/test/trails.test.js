// Trilhas por competência: regras de desbloqueio (unidade) e a trava aplicada pela API.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const db = require("../src/db");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const {
  requiredToUnlock,
  buildTrails,
  getUnlockedChallengeIds,
} = require("../src/services/trails");

// Catálogo de exemplo: Comunicação com 4 básicos, 4 intermediários e 1 avançado.
const fake = (id, dificuldade, categoria = "Comunicação") => ({
  id,
  categoria,
  dificuldade,
  tipo: dificuldade === "basico" ? "fechado" : "aberto",
  titulo: id,
});
const CATALOG = [
  ...["b1", "b2", "b3", "b4"].map((id) => fake(id, "basico")),
  ...["i1", "i2", "i3", "i4"].map((id) => fake(id, "intermediario")),
  fake("a1", "avancado"),
];
const answered = (...ids) => ids.map((challengeId) => ({ challengeId }));
const levels = (attempts, catalog = CATALOG) =>
  Object.fromEntries(
    buildTrails(attempts, catalog)[0].niveis.map((nivel) => [nivel.dificuldade, nivel]),
  );

test("são necessários 75% do nível anterior, arredondando para cima", () => {
  assert.equal(requiredToUnlock(4), 3);
  assert.equal(requiredToUnlock(3), 3);
  assert.equal(requiredToUnlock(2), 2);
  assert.equal(requiredToUnlock(1), 1);
  assert.equal(requiredToUnlock(0), 0);
});

test("básico sempre liberado; o próximo nível abre com 3 de 4 do anterior", () => {
  let nivel = levels([]);
  assert.equal(nivel.basico.liberado, true);
  assert.equal(nivel.intermediario.liberado, false);
  assert.equal(nivel.avancado.liberado, false);

  nivel = levels(answered("b1", "b2"));
  assert.equal(nivel.intermediario.liberado, false);
  assert.equal(nivel.basico.concluidos, 2);

  nivel = levels(answered("b1", "b2", "b3"));
  assert.equal(nivel.intermediario.liberado, true);
  assert.equal(nivel.avancado.liberado, false);

  nivel = levels(answered("b1", "b2", "b3", "i1", "i2", "i3"));
  assert.equal(nivel.avancado.liberado, true);
});

test("intermediários respondidos não abrem o avançado se o intermediário está bloqueado", () => {
  // Quem respondeu antes das trilhas existirem: os intermediários contam como concluídos,
  // mas o nível só libera depois que o básico liberar.
  const nivel = levels(answered("i1", "i2", "i3"));
  assert.equal(nivel.intermediario.liberado, false);
  assert.equal(nivel.avancado.liberado, false);
});

test("desafio já respondido continua liberado para refazer, mesmo em nível bloqueado", () => {
  const unlocked = getUnlockedChallengeIds(answered("a1"), CATALOG);
  assert.ok(unlocked.has("a1"));
  assert.ok(!unlocked.has("i1"));
  assert.ok(unlocked.has("b1"));
});

test("nível vazio não trava a trilha", () => {
  const catalog = [fake("i1", "intermediario"), fake("a1", "avancado")];
  let nivel = levels([], catalog);
  assert.equal(nivel.basico.total, 0);
  assert.equal(nivel.intermediario.liberado, true);
  assert.equal(nivel.avancado.liberado, false);

  nivel = levels(answered("i1"), catalog);
  assert.equal(nivel.avancado.liberado, true);
});

test("só competências com desafio publicado; próximo é o primeiro liberado e não feito", () => {
  const catalog = [...CATALOG, fake("x1", "basico", "Liderança")];
  const trails = buildTrails(answered("b1"), catalog);

  assert.deepEqual(
    trails.map((trail) => trail.nome),
    ["Comunicação", "Liderança"],
  );
  assert.equal(trails[0].proximoId, "b2");
  assert.equal(trails[0].concluidos, 1);
  assert.equal(trails[0].total, 9);

  const done = buildTrails(answered("x1"), catalog)[1];
  assert.equal(done.proximoId, null);
});

// API, com o catálogo semente: Comunicação tem 3 básicos (closed-1..3),
// 2 intermediários (open-1, open-3) e 1 avançado (open-2).
let server;
let baseUrl;
let session;

const ANSWER =
  "Explico com clareza o impacto para a equipe, alinho as prioridades e proponho os próximos passos com transparência.";

async function api(method, url, body) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}

test.before(async () => {
  await db.initDatabase();
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;

  const response = await api("POST", "/api/auth/register", {
    nome: "Trilha",
    email: "trilha@teste.com",
    senha: "senha123",
    aceiteTermos: true,
  });
  session = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0];
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

const comunicacao = async () =>
  (await api("GET", "/api/trails")).data.trilhas.find((trail) => trail.nome === "Comunicação");

test("API: trilhas exigem sessão e mostram o progresso por nível", async () => {
  const savedSession = session;
  session = null;
  assert.equal((await api("GET", "/api/trails")).status, 401);
  session = savedSession;

  const { status, data } = await api("GET", "/api/trails");
  assert.equal(status, 200);
  assert.equal(data.trilhas.length, 5);

  const trail = data.trilhas.find((item) => item.nome === "Comunicação");
  assert.deepEqual(
    trail.niveis.map(({ dificuldade, total, necessarios, liberado }) => ({
      dificuldade,
      total,
      necessarios,
      liberado,
    })),
    [
      { dificuldade: "basico", total: 3, necessarios: 3, liberado: true },
      { dificuldade: "intermediario", total: 2, necessarios: 2, liberado: false },
      { dificuldade: "avancado", total: 1, necessarios: 1, liberado: false },
    ],
  );
  assert.equal(trail.proximoId, "communication-closed-1");
});

test("API: desafio de nível bloqueado é recusado sem gravar nada", async () => {
  const { status, data } = await api("POST", "/api/challenges/communication-open-1/submit", {
    texto: ANSWER,
  });
  assert.equal(status, 403);
  assert.match(data.message, /bloqueado/);

  const listed = (await api("GET", "/api/challenges")).data.challenges;
  assert.equal(listed.find((item) => item.id === "communication-open-1").liberado, false);
  assert.equal(listed.find((item) => item.id === "communication-closed-1").liberado, true);

  const me = (await api("GET", "/api/me")).data.user;
  assert.equal(me.completedChallenges, 0);
});

test("API: concluir o básico libera o intermediário; o avançado segue bloqueado", async () => {
  for (const id of ["communication-closed-1", "communication-closed-2", "communication-closed-3"]) {
    // Qualquer resposta conta, inclusive a mais fraca.
    const { status } = await api("POST", `/api/challenges/${id}/submit`, { respostaId: "a" });
    assert.equal(status, 200);
  }

  const trail = await comunicacao();
  assert.equal(trail.niveis[1].liberado, true);
  assert.equal(trail.niveis[2].liberado, false);
  assert.equal(trail.proximoId, "communication-open-1");

  const open = await api("POST", "/api/challenges/communication-open-1/submit", { texto: ANSWER });
  assert.equal(open.status, 200);

  const advanced = await api("POST", "/api/challenges/communication-open-2/submit", {
    texto: ANSWER,
  });
  assert.equal(advanced.status, 403);
});

test("API: refazer um desafio respondido continua permitido", async () => {
  const { status, data } = await api("POST", "/api/challenges/communication-closed-1/submit", {
    respostaId: "b",
  });
  assert.equal(status, 200);
  assert.equal(data.result.revisao, true);
});
