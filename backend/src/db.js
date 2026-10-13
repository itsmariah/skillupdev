const crypto = require("crypto");
const fsPromises = require("fs/promises");
const fs = require("fs");
const { Redis } = require("@upstash/redis");

const { DATA_FILE, DATA_DIR, REDIS_DB_KEY, PASSWORD_RESET_TTL_MS } = require("./config");
const { getChallengeById } = require("./content/challenges");
const { deriveQualityTier } = require("./services/gamification");
const { hydrateUser } = require("./services/users");

const redisClient =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

let writeQueue = Promise.resolve();
let inMemoryDatabase = null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyDatabase(), null, 2));
  }
}

function createEmptyDatabase() {
  return {
    users: [],
    sessions: [],
    challengeAttempts: [],
    passwordResetTokens: [],
    study_responses: [],
  };
}

function hydrateAttempt(attempt) {
  const challenge = getChallengeById(attempt?.challengeId);
  const score = Number(attempt?.score) || 0;
  const qualityTier =
    attempt?.qualityTier || deriveQualityTier(score, challenge?.tipo || attempt?.challengeType);

  return {
    ...attempt,
    score,
    xpAwarded: Number(attempt?.xpAwarded) || 0,
    xpBreakdown: Array.isArray(attempt?.xpBreakdown) ? attempt.xpBreakdown : [],
    category: attempt?.category || challenge?.categoria || "",
    qualityTier,
    wasIdeal:
      typeof attempt?.wasIdeal === "boolean" ? attempt.wasIdeal : qualityTier === "ideal",
    unlockedBadges: Array.isArray(attempt?.unlockedBadges) ? attempt.unlockedBadges : [],
  };
}

function hydratePasswordResetToken(resetToken) {
  return {
    id: String(resetToken?.id || crypto.randomUUID()),
    userId: String(resetToken?.userId || ""),
    tokenHash: String(resetToken?.tokenHash || ""),
    createdAt: String(resetToken?.createdAt || new Date().toISOString()),
    expiresAt: String(resetToken?.expiresAt || new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()),
  };
}

function isPasswordResetTokenExpired(resetToken, now = Date.now()) {
  const expiresAt = Date.parse(resetToken?.expiresAt || "");
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

function purgeExpiredPasswordResetTokens(database) {
  const previousLength = Array.isArray(database.passwordResetTokens)
    ? database.passwordResetTokens.length
    : 0;

  database.passwordResetTokens = (database.passwordResetTokens || []).filter(
    (resetToken) => !isPasswordResetTokenExpired(resetToken)
  );

  return database.passwordResetTokens.length !== previousLength;
}

function isSessionExpired(session) {
  if (!session?.expiresAt) return true;
  return new Date(session.expiresAt) < new Date();
}

function purgeExpiredSessions(database) {
  const previousLength = Array.isArray(database.sessions) ? database.sessions.length : 0;
  database.sessions = (database.sessions || []).filter((s) => !isSessionExpired(s));
  return database.sessions.length !== previousLength;
}

async function loadPersistedDatabase() {
  if (redisClient) {
    const stored = await redisClient.get(REDIS_DB_KEY);
    return stored || null;
  }

  ensureDataFile();
  const raw = await fsPromises.readFile(DATA_FILE, "utf8");
  return raw.trim() ? JSON.parse(raw) : null;
}

async function persistDatabase(data) {
  if (redisClient) {
    await redisClient.set(REDIS_DB_KEY, data);
    return;
  }

  ensureDataFile();
  await fsPromises.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readDatabase() {
  if (inMemoryDatabase) {
    return inMemoryDatabase;
  }

  // Não há fallback para banco vazio em caso de erro: um banco vazio em memória
  // seria gravado por cima dos dados reais na próxima escrita.
  const parsed = await loadPersistedDatabase();

  if (!parsed) {
    inMemoryDatabase = createEmptyDatabase();
    return inMemoryDatabase;
  }

  if (typeof parsed !== "object" || !Array.isArray(parsed.users)) {
    throw new Error("Banco persistido em formato inesperado (sem lista de usuários).");
  }

  inMemoryDatabase = {
    users: parsed.users.map(hydrateUser),
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    challengeAttempts: Array.isArray(parsed.challengeAttempts)
      ? parsed.challengeAttempts.map(hydrateAttempt)
      : [],
    passwordResetTokens: Array.isArray(parsed.passwordResetTokens)
      ? parsed.passwordResetTokens.map(hydratePasswordResetToken)
      : [],
    study_responses: Array.isArray(parsed.study_responses) ? parsed.study_responses : [],
  };
  return inMemoryDatabase;
}

async function writeDatabase(data) {
  const doWrite = () => persistDatabase(data);

  writeQueue = writeQueue.then(doWrite, doWrite);

  return writeQueue;
}

module.exports = {
  redisClient,
  ensureDataFile,
  createEmptyDatabase,
  hydrateAttempt,
  hydratePasswordResetToken,
  isPasswordResetTokenExpired,
  purgeExpiredPasswordResetTokens,
  isSessionExpired,
  purgeExpiredSessions,
  loadPersistedDatabase,
  persistDatabase,
  readDatabase,
  writeDatabase,
};
