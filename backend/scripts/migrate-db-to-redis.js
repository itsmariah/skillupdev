// Migração única: envia o conteúdo de um db.json existente para o Upstash Redis.
// Uso: node backend/scripts/migrate-db-to-redis.js [caminho/para/db.json]
const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const sourcePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, "..", "data", "db.json");

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN (no backend/.env) antes de migrar."
    );
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const data = JSON.parse(raw);

  const redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const key = process.env.REDIS_DB_KEY || "skillupdev:db";
  await redisClient.set(key, data);

  console.log(
    `Migrado com sucesso: ${sourcePath} -> Redis[${key}] ` +
      `(${data.users?.length || 0} usuários, ${data.challengeAttempts?.length || 0} tentativas, ` +
      `${data.study_responses?.length || 0} respostas do estudo)`
  );
}

main().catch((error) => {
  console.error("Falha na migração:", error);
  process.exit(1);
});
