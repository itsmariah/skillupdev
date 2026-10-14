// Integridade da semente de desafios (content/challenges.js, gravada no banco na primeira
// inicialização) e da taxonomia. Conteúdo novo é validado pelo painel (services/content.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHALLENGES, ALL_CATEGORIES } = require("../src/content/challenges");
const { COMPETENCIES, SKILLS, getSkillById } = require("../src/content/competencies");
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

test("taxonomia: as competências são as 5 categorias, com 3 a 4 habilidades cada", () => {
  assert.deepEqual(
    COMPETENCIES.map((competency) => competency.nome).sort(),
    [...ALL_CATEGORIES].sort(),
  );
  assert.equal(new Set(SKILLS.map((skill) => skill.id)).size, SKILLS.length);
  assert.equal(new Set(SKILLS.map((skill) => skill.nome)).size, SKILLS.length);

  for (const competency of COMPETENCIES) {
    assert.ok(
      competency.habilidades.length >= 3 && competency.habilidades.length <= 4,
      competency.id,
    );
  }

  for (const skill of SKILLS) {
    assert.ok(skill.descricao, skill.id);
    assert.ok(
      skill.rubrica.fraca && skill.rubrica.boa && skill.rubrica.ideal,
      `${skill.id}: rubrica`,
    );
    assert.ok(skill.palavrasChave.length >= 5, `${skill.id}: palavras-chave`);
  }
});

test("todo desafio exercita de 1 a 3 habilidades que existem na taxonomia", () => {
  for (const challenge of CHALLENGES) {
    assert.ok(challenge.habilidades.length >= 1 && challenge.habilidades.length <= 3, challenge.id);
    assert.equal(new Set(challenge.habilidades).size, challenge.habilidades.length, challenge.id);
    for (const skillId of challenge.habilidades) {
      assert.ok(getSkillById(skillId), `${challenge.id}: habilidade ${skillId} não existe`);
    }
  }
});

test("nos abertos, os critérios da IA são os nomes das habilidades", () => {
  for (const challenge of CHALLENGES.filter((item) => item.tipo === "aberto")) {
    assert.deepEqual(
      challenge.criteriosAvaliacao,
      challenge.habilidades.map((skillId) => getSkillById(skillId).nome),
      challenge.id,
    );
  }
});

test("toda habilidade é exercitada por pelo menos um desafio", () => {
  const used = new Set(CHALLENGES.flatMap((challenge) => challenge.habilidades));
  for (const skill of SKILLS) {
    assert.ok(used.has(skill.id), `${skill.id}: nenhum desafio usa`);
  }
});

test("semente: por competência, 3 básicos (fechados), 2 intermediários e 1 avançado", () => {
  for (const category of ALL_CATEGORIES) {
    const inCategory = CHALLENGES.filter((challenge) => challenge.categoria === category);
    const count = (level) =>
      inCategory.filter((challenge) => challenge.dificuldade === level).length;

    assert.deepEqual(
      [count("basico"), count("intermediario"), count("avancado")],
      [3, 2, 1],
      category,
    );
    assert.ok(
      inCategory
        .filter((challenge) => challenge.dificuldade === "basico")
        .every((challenge) => challenge.tipo === "fechado"),
      category,
    );
  }
});
