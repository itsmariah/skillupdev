// Ponto de entrada: valida a configuração, prepara o banco (migrações), garante o admin e
// inicia o servidor HTTP.
// A aplicação Express fica em src/app.js e as regras em src/services/.
const crypto = require("crypto");

const app = require("./src/app");
const { PORT, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./src/config");
const db = require("./src/db");
const { validateEnv } = require("./src/env");
const { logger } = require("./src/lib/logger");
const { normalizeEmail } = require("./src/lib/text");
const { sendAlert } = require("./src/services/alerts");
const { createPasswordHash } = require("./src/services/auth");
const { ROLES } = require("./src/services/roles");
const { DEFAULT_AVATAR, createDefaultGamificationState } = require("./src/services/gamification");

async function ensureAdminExists() {
  if (!ADMIN_PASSWORD) {
    logger.warn("ADMIN_PASSWORD não definido. O admin não será criado automaticamente.");
    return;
  }

  if (await db.hasAdmin()) return;

  const admin = {
    id: crypto.randomUUID(),
    nome: "Administrador",
    email: normalizeEmail(ADMIN_EMAIL),
    passwordHash: createPasswordHash(ADMIN_PASSWORD),
    role: ROLES.ADMIN,
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
  logger.info("Usuário administrador criado.");
}

function checkEnvironment() {
  const { errors, warnings } = validateEnv();

  for (const warning of warnings) {
    logger.warn(`Configuração: ${warning}`);
  }

  if (errors.length > 0) {
    logger.error("Configuração inválida. O servidor não será iniciado.", { errors });
    process.exit(1);
  }
}

async function start() {
  checkEnvironment();

  try {
    const client = await db.initDatabase();
    logger.info("Banco conectado.", {
      database: client.kind === "postgres" ? "PostgreSQL" : "PGlite local",
    });
    await ensureAdminExists();
    await db.purgeExpiredSessions();
    await db.purgeExpiredResetTokens();
  } catch (error) {
    logger.error("Falha ao preparar o banco. O servidor não será iniciado.", { err: error });
    await sendAlert({ key: "startup-db", title: "o servidor não subiu: falha no banco", error });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`SkillUp Dev online em http://localhost:${PORT}`, { port: PORT });
  });

  // Encerramento gracioso: o Render manda SIGTERM a cada deploy e o Ctrl+C manda SIGINT. Para
  // de aceitar conexões, deixa as requisições em andamento terminarem e fecha o banco (o PGlite
  // local pode corromper a pasta de dados se o processo morrer no meio de uma escrita).
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Encerrando o servidor.", { signal });
    setTimeout(() => {
      logger.error("Encerramento demorou demais. Saindo assim mesmo.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      try {
        await db.closeClient();
        // Sem process.exit: o processo termina sozinho quando não sobra nada pendente (forçar a
        // saída com conexões ainda fechando derruba o Node no Windows).
        process.exitCode = 0;
        logger.info("Servidor encerrado.");
      } catch (error) {
        logger.error("Falha ao fechar o banco.", { err: error });
        process.exit(1);
      }
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

// Erros fora de uma requisição. Promessa rejeitada sem tratamento: registra e avisa, o servidor
// segue. Exceção não capturada: o processo fica num estado desconhecido, então registra, avisa
// e encerra (o Render sobe de novo).
process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Promessa rejeitada sem tratamento.", { err: error });
  sendAlert({ key: "unhandledRejection", title: "promessa rejeitada sem tratamento", error });
});

process.on("uncaughtException", async (error) => {
  logger.error("Exceção não capturada. Encerrando o processo.", { err: error });
  await sendAlert({
    key: "uncaughtException",
    title: "exceção não capturada: processo reiniciando",
    error,
  });
  process.exit(1);
});

start();
