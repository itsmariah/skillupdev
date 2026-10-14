const { getClient, closeClient, isUniqueViolation } = require("./client");
const { runMigrations } = require("./migrate");
const { seedChallengesIfEmpty, reloadCatalog } = require("./challenges");

// Abre a conexão, aplica as migrações pendentes, grava a semente de desafios (só no banco
// vazio) e carrega o catálogo em memória. Chamado uma vez na inicialização.
async function initDatabase() {
  const client = getClient();
  await runMigrations(client);
  await seedChallengesIfEmpty(client);
  await reloadCatalog(client);
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
};
