// Várias tentativas pela API: XP só pela melhora, contagens por desafio e nível pela última.
// Sem OPENAI_API_KEY, os abertos usam a análise de reserva (determinística por palavras-chave).
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const catalog = require("../src/content/catalog");
const db = require("../src/db");
const { SESSION_COOKIE } = require("../src/middleware/auth");

let server;
let baseUrl;
let session;
let userId;

const CHALLENGE = "communication-open-2"; // Transparência, Responsabilidade, Clareza
const WEAK = "Vou tentar terminar o quanto antes e depois aviso o gestor se precisar disso.";
const STRONG =
  "Aviso o gestor hoje mesmo, de forma transparente: explico o risco de atraso, o impacto para o cliente, assumo minha parte e proponho um novo prazo realista com os próximos passos claros, e vou acompanhar até resolver.";

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

const submit = (texto) => api("POST", `/api/challenges/${CHALLENGE}/submit`, { texto });

// Este arquivo não testa as trilhas (test/trails.test.js testa): com todos os desafios no
// nível básico, nenhum fica bloqueado e as contagens daqui não dependem do desbloqueio.
function unlockAllLevels() {
  catalog.setCatalog(
    catalog.seedEntries().map((entry) => ({
      ...entry,
      versions: entry.versions.map((version) => ({
        ...version,
        content: { ...version.content, dificuldade: "basico" },
      })),
    })),
  );
}

test.before(async () => {
  await db.initDatabase();
  unlockAllLevels();
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;

  const response = await api("POST", "/api/auth/register", {
    nome: "Refaz",
    email: "refaz@teste.com",
    senha: "senha123",
    aceiteTermos: true,
  });
  session = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0];
  userId = response.data.user.id;
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

test("refazer um aberto: XP só quando a nota sobe de faixa", async () => {
  const first = await submit(WEAK);
  assert.equal(first.status, 200);
  assert.equal(first.data.result.tentativa, 1);
  assert.notEqual(first.data.result.qualityTier, "ideal");
  const idealBefore = first.data.user.gamification.idealAnswers;
  const streakBefore = first.data.user.gamification.perfectStreak;

  const second = await submit(STRONG);
  assert.equal(second.data.result.tentativa, 2);
  assert.equal(second.data.result.qualityTier, "ideal");
  assert.ok(second.data.result.xpGanho > 0);
  assert.equal(second.data.result.revisao, false);
  assert.equal(second.data.user.gamification.idealAnswers, idealBefore + 1);
  assert.equal(second.data.user.gamification.perfectStreak, streakBefore);

  const third = await submit(STRONG);
  assert.equal(third.data.result.tentativa, 3);
  assert.equal(third.data.result.xpGanho, 0);
  assert.equal(third.data.user.gamification.idealAnswers, idealBefore + 1);

  // Continua sendo um desafio só.
  assert.equal(third.data.user.completedChallenges, 1);
});

test("o nível nas habilidades segue a última tentativa", async () => {
  await submit(WEAK);
  const history = (await api("GET", "/api/me/history")).data;
  const transparency = history.evolution.competencias
    .flatMap((competency) => competency.habilidades)
    .find((skill) => skill.id === "transparencia");
  const attempts = await db.listAttemptsForChallenge(userId, CHALLENGE);

  assert.equal(attempts.length, 4);
  assert.equal(transparency.score, attempts[3].score);
  assert.equal(history.evolution.completed, 1);
  assert.equal(
    history.evolution.byCategory.find((item) => item.categoria === "Comunicação").bestScore,
    100,
  );
});

test("a lista de desafios mostra tentativas, melhor nota e convite para melhorar", async () => {
  const { data } = await api("GET", "/api/challenges");
  const challenge = data.challenges.find((item) => item.id === CHALLENGE);

  assert.equal(challenge.completed, true);
  assert.equal(challenge.tentativas, 4);
  assert.equal(challenge.melhorNota, 100);
  assert.equal(challenge.refazer, "melhorar");
  assert.equal(challenge.lastResult.tentativa, 4);
});

test("diário de reflexão: salvar, editar, apagar e só a própria pessoa", async () => {
  const [attempt] = await db.listAttemptsForChallenge(userId, CHALLENGE);
  const url = `/api/me/attempts/${attempt.id}/reflection`;

  const saved = await api("PUT", url, { texto: "  Faltou avisar cedo e propor um novo prazo.  " });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.reflexao, "Faltou avisar cedo e propor um novo prazo.");
  assert.ok(saved.data.reflexaoEm);

  const edited = await api("PUT", url, { texto: "Na próxima, aviso no mesmo dia." });
  assert.equal(edited.data.reflexao, "Na próxima, aviso no mesmo dia.");

  const tooLong = await api("PUT", url, { texto: "x".repeat(1001) });
  assert.equal(tooLong.status, 400);

  const history = (await api("GET", "/api/me/history")).data;
  assert.equal(
    history.items.find((item) => item.id === attempt.id).reflexao,
    "Na próxima, aviso no mesmo dia.",
  );

  const exported = (await api("GET", "/api/me/export")).data;
  assert.equal(
    exported.tentativas.find((item) => item.tentativa === 1 && item.desafio.id === CHALLENGE)
      .reflexao.texto,
    "Na próxima, aviso no mesmo dia.",
  );

  // Outra pessoa não escreve na tentativa de alguém.
  const ownSession = session;
  const other = await api("POST", "/api/auth/register", {
    nome: "Outra",
    email: "outra-reflexao@teste.com",
    senha: "senha123",
    aceiteTermos: true,
  });
  session = other.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0];
  assert.equal((await api("PUT", url, { texto: "invasão" })).status, 404);
  session = ownSession;

  const cleared = await api("PUT", url, { texto: "   " });
  assert.equal(cleared.data.reflexao, null);
  const [after] = await db.listAttemptsForChallenge(userId, CHALLENGE);
  assert.equal(after.reflection, null);
  assert.equal(after.reflectionUpdatedAt, null);
});

test("o resultado do envio informa o id da tentativa (para a reflexão)", async () => {
  const { data } = await submit(STRONG);
  const attempts = await db.listAttemptsForChallenge(userId, CHALLENGE);
  assert.equal(data.result.tentativaId, attempts[attempts.length - 1].id);
});
