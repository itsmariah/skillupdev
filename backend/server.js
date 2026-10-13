// Ponto de entrada: carrega o banco, garante o admin e inicia o servidor HTTP.
// A aplicação Express fica em src/app.js e as regras em src/services/.
const crypto = require("crypto");

const app = require("./src/app");
const { PORT, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./src/config");
const { readDatabase, writeDatabase } = require("./src/db");
const { normalizeEmail } = require("./src/lib/text");
const { createPasswordHash } = require("./src/services/auth");
const { DEFAULT_AVATAR, createDefaultGamificationState } = require("./src/services/gamification");

async function ensureAdminExists() {
  if (!ADMIN_PASSWORD) {
    console.warn("[Admin] ADMIN_PASSWORD não definido. Admin não será criado automaticamente.");
    return;
  }

  const database = await readDatabase();

  const adminExists = database.users.some((u) => u.isAdmin);
  if (adminExists) return;

  const admin = {
    id: crypto.randomUUID(),
    nome: "Administrador",
    email: normalizeEmail(ADMIN_EMAIL),
    passwordHash: createPasswordHash(ADMIN_PASSWORD),
    isAdmin: true,
    xp: 0,
    nivel: 1,
    badges: [],
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
    studyPreDone: true,
    studyPostDone: true,
    createdAt: new Date().toISOString(),
  };

  database.users.push(admin);
  await writeDatabase(database);
  console.log("[Admin] Usuário administrador criado com sucesso.");
}

async function start() {
  try {
    await readDatabase();
    await ensureAdminExists();
  } catch (error) {
    console.error("[Banco] Falha ao carregar o banco. Servidor não será iniciado para não sobrescrever dados.", error);
    process.exit(1);
  }

  if (!process.env.APP_BASE_URL) {
    console.warn("[Config] APP_BASE_URL não definido. Links de e-mail apontarão para localhost.");
  }

  app.listen(PORT, () => {
    console.log(`SkillUp Dev backend online em http://localhost:${PORT}`);
  });
}

start();
