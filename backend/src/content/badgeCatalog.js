// Catálogo de badges em memória, no mesmo modelo do catálogo de desafios: a fonte é o banco
// (tabela badges), carregado na inicialização e recarregado quando o admin edita. Antes da
// carga (testes de unidade, scripts), usa a semente de content/badges.js.
const { SEED_BADGES } = require("./badges");

let badges = [];
let badgesById = new Map();

// list: [{ id, name, description, rarity, rule, active, position }]
function setBadges(list) {
  badges = [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  badgesById = new Map(badges.map((badge) => [badge.id, badge]));
}

function seedBadgeEntries() {
  return SEED_BADGES.map((badge, index) => ({ ...badge, position: index + 1 }));
}

setBadges(seedBadgeEntries());

// Todas, inclusive desativadas (quem já ganhou continua vendo a sua).
function getBadges() {
  return badges;
}

// As que ainda podem ser conquistadas.
function getActiveBadges() {
  return badges.filter((badge) => badge.active);
}

function getBadgeById(id) {
  return badgesById.get(id) || null;
}

module.exports = { setBadges, seedBadgeEntries, getBadges, getActiveBadges, getBadgeById };
