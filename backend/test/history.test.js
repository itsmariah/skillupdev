// Histórico de feedbacks e números da evolução (funções puras sobre as tentativas).
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHALLENGES } = require("../src/content/challenges");
const { buildEvolution, buildHistory } = require("../src/services/history");

const day = (n) => `2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`;

function attemptsWithScores(scores) {
  return scores.map((score, index) => ({
    id: `a${index}`,
    challengeId: CHALLENGES[index].id,
    answer: "resposta",
    score,
    qualityTier: "medium",
    feedback: "feedback",
    xpAwarded: 50,
    createdAt: day(index + 1),
  }));
}

test("sem tentativas: médias e tendência ficam nulas", () => {
  const evolution = buildEvolution([]);
  assert.equal(evolution.completed, 0);
  assert.equal(evolution.averageScore, null);
  assert.equal(evolution.trend, null);
  assert.ok(evolution.byCategory.every((item) => item.averageScore === null));
});

test("tendência compara as últimas tentativas com as anteriores", () => {
  assert.equal(buildEvolution(attemptsWithScores([50, 60, 70])).trend, null);

  const four = buildEvolution(attemptsWithScores([40, 50, 80, 90])).trend;
  assert.deepEqual(four, { window: 2, recentAverage: 85, previousAverage: 45, delta: 40 });

  // Com 12 tentativas a janela para em 5: as 2 primeiras ficam de fora.
  const twelve = buildEvolution(
    attemptsWithScores([0, 0, ...Array(5).fill(60), ...Array(5).fill(70)]),
  );
  assert.deepEqual(twelve.trend, { window: 5, recentAverage: 70, previousAverage: 60, delta: 10 });
});

test("média por categoria usa só as tentativas daquela categoria", () => {
  const attempts = attemptsWithScores([100, 50]);
  const categoria = CHALLENGES[0].categoria;
  const evolution = buildEvolution(attempts);
  const item = evolution.byCategory.find((entry) => entry.categoria === categoria);

  const expected = attempts.filter(
    (attempt) => CHALLENGES.find((c) => c.id === attempt.challengeId).categoria === categoria,
  );
  assert.equal(item.completed, expected.length);
  assert.equal(item.bestScore, Math.max(...expected.map((attempt) => attempt.score)));
  assert.equal(evolution.averageScore, 75);
});

test("histórico vem do mais recente para o mais antigo e ignora desafios removidos", () => {
  const attempts = [
    ...attemptsWithScores([70, 80]),
    { id: "x", challengeId: "desafio-removido", score: 10, createdAt: day(20) },
  ];
  const { items } = buildHistory(attempts);

  assert.deepEqual(
    items.map((item) => item.id),
    ["a1", "a0"],
  );
  assert.equal(items[0].titulo, CHALLENGES[1].titulo);
  assert.deepEqual(items[0].criteriaScores, []);
});

test("notas por critério da IA chegam sem a evidência interna", () => {
  const [attempt] = attemptsWithScores([80]);
  attempt.evaluator = "ai";
  attempt.evaluation = {
    criteriaScores: [{ criterio: "Empatia", nota: 80, evidencia: "trecho da resposta" }],
  };

  const [item] = buildHistory([attempt]).items;
  assert.equal(item.evaluator, "ai");
  assert.deepEqual(item.criteriaScores, [{ criterio: "Empatia", nota: 80 }]);
});
