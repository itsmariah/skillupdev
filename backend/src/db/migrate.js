// Aplica, em ordem, os arquivos de migrations/ que ainda não foram aplicados.
// Cada migração roda numa transação e fica registrada em schema_migrations.
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function runMigrations(client) {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const pending = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && !applied.has(file))
    .sort();

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    await client.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });

    console.log(`[Banco] Migração aplicada: ${file}`);
  }

  return pending;
}

module.exports = {
  runMigrations,
};
