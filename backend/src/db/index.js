const { getClient, closeClient, isUniqueViolation } = require("./client");
const { runMigrations } = require("./migrate");

// Abre a conexão e aplica as migrações pendentes. Chamado uma vez na inicialização.
async function initDatabase() {
  const client = getClient();
  await runMigrations(client);
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
};
