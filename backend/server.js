// Ponto de entrada: prepara o banco (migrações), garante o admin e inicia o servidor HTTP.
// A aplicação Express fica em src/app.js e as regras em src/services/.
const crypto = require("crypto");

const app = require("./src/app");
const { PORT, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./src/config");
const db = require("./src/db");
const { normalizeEmail } = require("./src/lib/text");
const { createPasswordHash } = require("./src/services/auth");
const { DEFAULT_AVATAR, createDefaultGamificationState } = require("./src/services/gamification");

async function ensureAdminExists() {
  if (!ADMIN_PASSWORD) {
    console.warn("[Admin] ADMIN_PASSWORD não definido. Admin não será criado automaticamente.");
    return;
  }

  if (await db.hasAdmin()) return;

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

  await db.insertUser(admin);
  console.log("[Admin] Usuário administrador criado com sucesso.");
}

async function start() {
  try {
    const client = await db.initDatabase();
    console.log(`[Banco] Conectado (${client.kind === "postgres" ? "PostgreSQL" : "PGlite local"}).`);
    await ensureAdminExists();
    await db.purgeExpiredSessions();
    await db.purgeExpiredResetTokens();
  } catch (error) {
    console.error("[Banco] Falha ao preparar o banco. Servidor não será iniciado.", error);
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
