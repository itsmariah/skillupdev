const { getClient, closeClient, isUniqueViolation } = require("./client");
const { runMigrations } = require("./migrate");
const { seedChallengesIfEmpty, reloadCatalog } = require("./challenges");
const { seedBadgesIfEmpty, reloadBadges } = require("./badges");

// Abre a conexão, aplica as migrações pendentes, grava as sementes de desafios e de badges
// (só nas tabelas vazias) e carrega os catálogos em memória. Chamado uma vez na inicialização.
async function initDatabase() {
  const client = getClient();
  await runMigrations(client);
  await seedChallengesIfEmpty(client);
  await reloadCatalog(client);
  await seedBadgesIfEmpty(client);
  await reloadBadges(client);
  return client;
}

module.exports = {
  initDatabase,
  getClient,
  closeClient,
  isUniqueViolation,
  ...require("./users"),
  ...require("./attempts"),
  ...require("./sessions"),
  ...require("./resetTokens"),
  ...require("./studyResponses"),
  ...require("./challenges"),
  ...require("./badges"),
};
