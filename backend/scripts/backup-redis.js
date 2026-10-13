// Backup do banco: salva o conteúdo da chave do Upstash Redis em um arquivo JSON local.
// Uso: node backend/scripts/backup-redis.js [caminho/de/saida.json]
// O arquivo contém dados pessoais e hashes de senha: não versionar nem compartilhar.
const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN (no backend/.env) antes do backup."
    );
  }

  const redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const key = process.env.REDIS_DB_KEY || "skillupdev:db";
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error(`A chave Redis[${key}] está vazia ou não existe. Nada foi salvo.`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, "..", "data", "backups", `db-${timestamp}.json`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log(
    `Backup salvo: Redis[${key}] -> ${outputPath} ` +
      `(${data.users?.length || 0} usuários, ${data.challengeAttempts?.length || 0} tentativas, ` +
      `${data.study_responses?.length || 0} respostas do estudo)`
  );
}

main().catch((error) => {
  console.error("Falha no backup:", error);
  process.exit(1);
});
