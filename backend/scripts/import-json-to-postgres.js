// Virada para o PostgreSQL: importa um backup JSON (gerado por `npm run backup`) para o banco
// apontado por DATABASE_URL. Cria as tabelas se for preciso e só roda num banco sem usuários.
// Uso: node backend/scripts/import-json-to-postgres.js caminho/do/backup.json
const fs = require("fs");
const path = require("path");

const db = require("../src/db");
const { importLegacyDatabase } = require("../src/db/legacy");

async function main() {
  const sourcePath = process.argv[2];

  if (!sourcePath) {
    throw new Error(
      "Informe o arquivo de backup. Ex.: npm run db:import -- backend/data/backups/db-....json",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Defina DATABASE_URL (no backend/.env) com a conexão do PostgreSQL de destino.",
    );
  }

  const data = JSON.parse(fs.readFileSync(path.resolve(sourcePath), "utf8"));
  const client = await db.initDatabase();
  const report = await importLegacyDatabase(data, client);

  console.log("Importação concluída:");
  console.table(report);

  if (report.duplicateAttempts || report.duplicateStudyResponses || report.orphans) {
    console.log(
      "Registros duplicados ou sem usuário foram ignorados (ver contagens acima). " +
        "Duplicatas vêm da antiga condição de corrida no envio de desafios.",
    );
  }
}

main()
  .catch((error) => {
    console.error("Falha na importação:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.closeClient());
