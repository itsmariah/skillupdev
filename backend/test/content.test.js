// Integridade da semente de desafios (content/challenges.js, gravada no banco na primeira
// inicialização) e da taxonomia. Conteúdo novo é validado pelo painel (services/content.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHALLENGES, ALL_CATEGORIES } = require("../src/content/challenges");
const { COMPETENCIES, SKILLS, getSkillById } = require("../src/content/competencies");
const { BADGE_XP, SEED_BADGES } = require("../src/content/badges");
const { validateBadge } = require("../src/services/badges");

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

test("semente de badges: regras válidas que citam só desafios existentes", () => {
  const ids = new Set(CHALLENGES.map((challenge) => challenge.id));

  for (const badge of SEED_BADGES) {
    const { errors, badge: normalized } = validateBadge(badge, ids);
    assert.deepEqual(errors, [], badge.id);
    assert.deepEqual(normalized.rule, badge.rule, `${badge.id}: regra muda ao validar`);
  }
});

test("semente de badges: id único, raridade com XP e as 12 originais ativas", () => {
  assert.equal(new Set(SEED_BADGES.map((badge) => badge.id)).size, SEED_BADGES.length);

  for (const badge of SEED_BADGES) {
    assert.ok(badge.rarity in BADGE_XP, badge.id);
  }

  assert.equal(SEED_BADGES.filter((badge) => badge.active).length, 12);
});

test("taxonomia: 10 competências (as 5 da semente e mais 5), com 3 a 4 habilidades cada", () => {
  const names = COMPETENCIES.map((competency) => competency.nome);
  assert.equal(names.length, 10);
  assert.equal(new Set(names).size, names.length);
  for (const category of ALL_CATEGORIES) {
    assert.ok(names.includes(category), `${category}: falta na taxonomia`);
  }
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

test("toda habilidade das competências da semente é exercitada por algum desafio", () => {
  // As competências novas ganham desafios pelo painel, em lotes.
  const seedCompetencies = new Set(
    COMPETENCIES.filter((competency) => ALL_CATEGORIES.includes(competency.nome)).map(
      (competency) => competency.id,
    ),
  );
  const used = new Set(CHALLENGES.flatMap((challenge) => challenge.habilidades));
  for (const skill of SKILLS.filter((item) => seedCompetencies.has(item.competencia))) {
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
