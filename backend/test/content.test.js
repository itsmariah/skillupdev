// Integridade do conteúdo: os desafios ainda estão fixos no código (auditoria, item 13),
// então estes testes evitam que uma edição quebre as regras de XP ou as badges.
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHALLENGES, ALL_CATEGORIES } = require("../src/content/challenges");
const { BADGE_DEFINITIONS, BADGE_XP } = require("../src/services/gamification");

test("há 30 desafios com ids únicos", () => {
  assert.equal(CHALLENGES.length, 30);
  assert.equal(new Set(CHALLENGES.map((challenge) => challenge.id)).size, CHALLENGES.length);
});

test("cada categoria tem 6 desafios", () => {
  for (const category of ALL_CATEGORIES) {
    const total = CHALLENGES.filter((challenge) => challenge.categoria === category).length;
    assert.equal(total, 6, category);
  }

  for (const challenge of CHALLENGES) {
    assert.ok(
      ALL_CATEGORIES.includes(challenge.categoria),
      `${challenge.id}: categoria desconhecida`,
    );
  }
});

test("desafios fechados têm uma alternativa de cada nível (5, 40 e 100 XP)", () => {
  for (const challenge of CHALLENGES.filter((item) => item.tipo === "fechado")) {
    const xpValues = challenge.respostas.map((answer) => answer.xp).sort((a, b) => a - b);

    assert.deepEqual(xpValues, [5, 40, 100], challenge.id);
    assert.equal(new Set(challenge.respostas.map((answer) => answer.id)).size, 3, challenge.id);

    for (const answer of challenge.respostas) {
      assert.ok(
        answer.texto && answer.feedback,
        `${challenge.id}/${answer.id}: texto ou feedback vazio`,
      );
    }
  }
});

test("desafios abertos têm critérios de avaliação", () => {
  for (const challenge of CHALLENGES.filter((item) => item.tipo === "aberto")) {
    assert.ok(challenge.criteriosAvaliacao?.length > 0, challenge.id);
    assert.ok(challenge.pergunta, challenge.id);
  }
});

test("todo desafio é aberto ou fechado", () => {
  for (const challenge of CHALLENGES) {
    assert.ok(["aberto", "fechado"].includes(challenge.tipo), challenge.id);
  }
});

test("badges citam apenas desafios que existem", () => {
  const ids = new Set(CHALLENGES.map((challenge) => challenge.id));

  for (const definition of BADGE_DEFINITIONS) {
    const referencedIds =
      definition.predicate.toString().match(/[a-z]+(?:-[a-z]+)*-(?:open|closed)-\d+/g) || [];

    for (const referencedId of referencedIds) {
      assert.ok(ids.has(referencedId), `${definition.id} cita ${referencedId}`);
    }
  }
});

test("badges têm id único e raridade com XP definido", () => {
  assert.equal(new Set(BADGE_DEFINITIONS.map((badge) => badge.id)).size, BADGE_DEFINITIONS.length);

  for (const definition of BADGE_DEFINITIONS) {
    assert.ok(definition.rarity in BADGE_XP, definition.id);
  }
});
