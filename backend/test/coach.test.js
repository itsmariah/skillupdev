// Coach: recomendação do próximo passo (regras) e resumo de evolução (IA, com reserva).
// Sem OPENAI_API_KEY: o resumo sai da reserva por regras e nenhuma chamada externa é feita.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const { getChallengeById } = require("../src/content/catalog");
const db = require("../src/db");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const { buildRecommendations } = require("../src/services/recommendation");
const {
  buildSummaryInput,
  buildHeuristicSummary,
  canSummarize,
  generateCoachSummary,
} = require("../src/services/coachSummary");

const day = (n) => `2026-11-${String(n).padStart(2, "0")}T12:00:00.000Z`;
let sequence = 0;

function attempt(challengeId, score, extra = {}) {
  const challenge = getChallengeById(challengeId);
  sequence += 1;
  return {
    id: `t${sequence}`,
    challengeId,
    challengeVersion: challenge.version,
    challengeType: challenge.tipo,
    category: challenge.categoria,
    attemptNumber: 1,
    answer: "resposta",
    score,
    qualityTier: score >= 85 ? "ideal" : score >= 60 ? "medium" : "low",
    createdAt: day(sequence),
    ...extra,
  };
}

let server;
let baseUrl;
let session;

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
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

test("sem tentativas: sugere começar pelo básico das trilhas", () => {
  const recommendations = buildRecommendations([]);

  assert.equal(recommendations.length, 3);
  assert.ok(recommendations.every((item) => item.tipo === "comecar"));
  assert.ok(recommendations.every((item) => item.desafio.dificuldade === "basico"));
  assert.equal(recommendations[0].trilha.nome, "Comunicação");
  assert.match(recommendations[0].motivo, /Comece pelo básico de Comunicação/);
});

test("habilidade mais fraca vem primeiro, com um desafio novo e liberado que a exercita", () => {
  const attempts = [
    attempt("communication-closed-1", 90), // Empatia, Transparência
    attempt("teamwork-closed-1", 45), // Colaboração, Priorização
  ];
  const [first] = buildRecommendations(attempts);

  // Colaboração (45) é a mais fraca; o próximo desafio liberado que a exercita é outro.
  assert.equal(first.tipo, "habilidade");
  assert.equal(first.habilidade.id, "colaboracao");
  assert.equal(first.habilidade.score, 45);
  assert.equal(first.desafio.id, "teamwork-closed-2");
  assert.equal(first.trilha.nome, "Trabalho em Equipe");
  assert.match(first.motivo, /está em 45, a mais baixa/);
});

test("habilidade fraca sem desafio novo liberado: passa para a próxima mais fraca", () => {
  const attempts = [
    attempt("communication-closed-1", 90), // Empatia, Transparência
    attempt("communication-closed-3", 40), // Assertividade, Empatia
  ];
  const [first] = buildRecommendations(attempts);

  // Assertividade (40) só aparece em desafios já respondidos ou de níveis bloqueados.
  assert.equal(first.habilidade.nome, "Empatia");
  assert.equal(first.habilidade.score, 65);
  assert.ok(getChallengeById(first.desafio.id).habilidades.includes("empatia"));
});

test("aberto com nota baixa entra como refazer; nível perto de liberar entra como liberar", () => {
  const attempts = [
    attempt("communication-closed-1", 100),
    attempt("communication-closed-2", 100),
    attempt("teamwork-open-1", 35),
  ];
  const recommendations = buildRecommendations(attempts);
  const retry = recommendations.find((item) => item.tipo === "refazer");
  const unlock = recommendations.find((item) => item.tipo === "liberar");

  assert.equal(retry.desafio.id, "teamwork-open-1");
  assert.match(retry.motivo, /última nota aqui foi 35/);
  assert.equal(unlock.desafio.id, "communication-closed-3");
  assert.match(
    unlock.motivo,
    /Falta 1 desafio do básico para liberar o intermediário em Comunicação/,
  );
  // Nenhum desafio repetido nem bloqueado.
  assert.equal(
    new Set(recommendations.map((item) => item.desafio.id)).size,
    recommendations.length,
  );
});

test("o resumo manda à IA só números e títulos, nunca respostas ou reflexões", () => {
  const attempts = [
    attempt("communication-closed-1", 80, { answer: "SEGREDO-DA-RESPOSTA" }),
    attempt("communication-open-1", 70, {
      answer: "OUTRO-SEGREDO",
      reflection: "REFLEXAO-PRIVADA",
      feedback: "FEEDBACK-COM-TRECHO",
    }),
  ];
  const input = buildSummaryInput(attempts, buildRecommendations(attempts));
  const sent = JSON.stringify(input);

  for (const secret of ["SEGREDO", "REFLEXAO", "FEEDBACK-COM"]) {
    assert.ok(!sent.includes(secret), secret);
  }
  assert.equal(input.desafiosConcluidos, 2);
  assert.equal(input.ultimasTentativas.length, 2);
  assert.ok(input.proximoPasso.desafio);
});

test("resumo por regras: ponto forte, foco e próximo passo", () => {
  const attempts = [
    attempt("communication-closed-1", 90),
    attempt("communication-closed-2", 70),
    attempt("communication-closed-3", 40),
  ];
  const recommendations = buildRecommendations(attempts);
  const summary = buildHeuristicSummary(attempts, recommendations);

  assert.match(summary.resumo, /^Você concluiu 3 de \d+ desafios, com nota média 67\./);
  assert.match(summary.pontosFortes, /ponto mais forte/);
  assert.match(summary.foco, /Vale praticar Assertividade \(40\)/);
  assert.ok(summary.foco.includes(recommendations[0].desafio.titulo));
  assert.equal(canSummarize(attempts), true);
  assert.equal(canSummarize(attempts.slice(0, 2)), false);
});

test("resumo com IA: saída estruturada; falha da IA cai nas regras", async (t) => {
  const attempts = [
    attempt("communication-closed-1", 90),
    attempt("communication-closed-2", 70),
    attempt("communication-closed-3", 40),
  ];
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "chave-de-teste";
  let request;
  t.after(() => {
    global.fetch = originalFetch;
    process.env.OPENAI_API_KEY = "";
  });

  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        model: "gpt-4o-mini",
        usage: { total_tokens: 200 },
        choices: [
          {
            message: {
              content: JSON.stringify({ resumo: "R.", pontos_fortes: "P.", foco: "F." }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const ok = await generateCoachSummary(attempts, []);
  assert.equal(ok.evaluator, "ai");
  assert.deepEqual(ok.summary, { resumo: "R.", pontosFortes: "P.", foco: "F." });
  assert.equal(request.response_format.json_schema.name, "resumo_de_evolucao");
  assert.ok(!request.messages[1].content.includes("resposta"));

  t.mock.method(console, "error", () => {});
  global.fetch = async () => new Response("{}", { status: 503 });
  const fallback = await generateCoachSummary(attempts, []);
  assert.equal(fallback.evaluator, "heuristic");
  assert.match(fallback.meta.fallbackReason, /503/);
});

test("API: coach exige sessão, guarda o resumo e só gera de novo com tentativas novas", async () => {
  assert.equal((await api("GET", "/api/me/coach")).status, 401);

  const registered = await api("POST", "/api/auth/register", {
    nome: "Coach",
    email: "coach@teste.com",
    senha: "senha123",
    aceiteTermos: true,
  });
  session = registered.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0];

  const answer = (id) =>
    api("POST", `/api/challenges/${id}/submit`, {
      respostaId: getChallengeById(id).respostas[0].id,
    });

  let coach = (await api("GET", "/api/me/coach")).data;
  assert.equal(coach.podeGerarResumo, false);
  assert.equal(coach.resumo, null);
  assert.equal(coach.recomendacoes[0].tipo, "comecar");
  assert.equal((await api("POST", "/api/me/coach/summary")).status, 400);

  for (const id of ["communication-closed-1", "communication-closed-2", "teamwork-closed-1"]) {
    assert.equal((await answer(id)).status, 200);
  }

  const first = await api("POST", "/api/me/coach/summary");
  assert.equal(first.status, 200);
  assert.equal(first.data.resumo.avaliador, "heuristic");
  assert.match(first.data.resumo.resumo, /Você concluiu 3 de/);
  assert.equal(first.data.resumoDesatualizado, false);

  // Sem tentativas novas: devolve o mesmo resumo guardado.
  const again = await api("POST", "/api/me/coach/summary");
  assert.equal(again.data.resumo.geradoEm, first.data.resumo.geradoEm);

  await answer("communication-closed-3");
  coach = (await api("GET", "/api/me/coach")).data;
  assert.equal(coach.resumoDesatualizado, true);

  const updated = await api("POST", "/api/me/coach/summary");
  assert.match(updated.data.resumo.resumo, /Você concluiu 4 de/);
  assert.equal(updated.data.resumoDesatualizado, false);

  const exported = (await api("GET", "/api/me/export")).data;
  assert.equal(exported.resumoDoCoach.resumo, updated.data.resumo.resumo);
});
