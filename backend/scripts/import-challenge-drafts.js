// Importa um lote de desafios (JSON em backend/content-drafts/) como RASCUNHO no banco.
// Rascunhos não aparecem para ninguém: revise e publique cada um no painel admin (Conteúdo).
// Uso: npm run content:import -- backend/content-drafts/lote-01-comunicacao.json
// O banco é o de DATABASE_URL (produção = Neon). Sem DATABASE_URL, o PGlite local.
const fs = require("fs");
const path = require("path");

const { DATABASE_URL } = require("../src/config");
const db = require("../src/db");
const { importChallengeDrafts } = require("../src/db/draftImport");

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    throw new Error(
      "Informe o arquivo do lote. Ex.: npm run content:import -- backend/content-drafts/lote-01-comunicacao.json",
    );
  }

  const batch = JSON.parse(fs.readFileSync(path.resolve(sourcePath), "utf8"));
  const target = DATABASE_URL ? `PostgreSQL (${new URL(DATABASE_URL).hostname})` : "PGlite local";
  console.log(`Banco de destino: ${target}`);

  const client = await db.initDatabase();
  const report = await importChallengeDrafts(batch, client);

  console.log(`Lote: ${report.lote || "(sem nome)"}`);
  console.log(`Rascunhos criados: ${report.criados.length}`);
  for (const item of report.criados) {
    console.log(`  + [${item.dificuldade}] ${item.titulo} (${item.id})`);
  }
  if (report.pulados.length > 0) {
    console.log(`Já existiam (pulados): ${report.pulados.join(", ")}`);
  }
  console.log("Revise e publique no painel admin, aba Conteúdo, filtrando por 'Nunca publicados'.");
}

main()
  .catch((error) => {
    console.error("Falha na importação:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.closeClient());
