// Validação das badges editadas no painel admin. A regra passa por content/badgeRules.js,
// que só aceita os tipos conhecidos e os parâmetros de cada tipo.
const { RARITIES } = require("../content/badges");
const { validateRule } = require("../content/badgeRules");
const { createChallengeId } = require("./content");

const LIMITS = { name: 60, description: 200 };

const clean = (value) => String(value ?? "").trim();

// knownChallengeIds: ids dos desafios existentes (para a regra de desafios específicos).
function validateBadge(input = {}, knownChallengeIds = new Set()) {
  const errors = [];
  const badge = {
    name: clean(input.name),
    description: clean(input.description),
    rarity: clean(input.rarity),
  };

  if (!badge.name) {
    errors.push("Nome: obrigatório.");
  } else if (badge.name.length > LIMITS.name) {
    errors.push(`Nome: no máximo ${LIMITS.name} caracteres.`);
  }

  if (!badge.description) {
    errors.push("Descrição: obrigatória.");
  } else if (badge.description.length > LIMITS.description) {
    errors.push(`Descrição: no máximo ${LIMITS.description} caracteres.`);
  }

  if (!RARITIES.includes(badge.rarity)) {
    errors.push("Raridade: escolha comum, raro, épico ou lendário.");
  }

  const ruleResult = validateRule(input.rule, knownChallengeIds);
  errors.push(...ruleResult.errors);
  badge.rule = ruleResult.rule;

  return { errors, badge };
}

// Mesmo formato dos ids de desafios criados no painel (slug do nome + sufixo aleatório),
// com prefixo para não colidir com as badges da semente.
function createBadgeId(name, random = Math.random) {
  return `badge-${createChallengeId(name, random)}`;
}

module.exports = { validateBadge, createBadgeId };
