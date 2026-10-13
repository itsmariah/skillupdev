// Importação do formato antigo (documento JSON único do Redis/db.json) para as tabelas.
// Usado pelo script scripts/import-json-to-postgres.js na virada para o PostgreSQL.
const crypto = require("crypto");

const { getChallengeById } = require("../content/challenges");
const { deriveQualityTier } = require("../services/gamification");
const { hydrateUser } = require("../services/users");
const { insertUser } = require("./users");
const { insertAttempt } = require("./attempts");
const { insertSession } = require("./sessions");
const { insertStudyResponse } = require("./studyResponses");

function hydrateAttempt(attempt) {
  const challenge = getChallengeById(attempt?.challengeId);
  const score = Number(attempt?.score) || 0;
  const qualityTier =
    attempt?.qualityTier || deriveQualityTier(score, challenge?.tipo || attempt?.challengeType);

  return {
    ...attempt,
    id: String(attempt?.id || crypto.randomUUID()),
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

// Importa tudo numa única transação: ou entra tudo, ou nada.
// Tokens de redefinição de senha não são importados (duram 30 minutos).
async function importLegacyDatabase(data, client) {
  if (!data || !Array.isArray(data.users)) {
    throw new Error("Arquivo em formato inesperado: falta a lista de usuários.");
  }

  const report = {
    users: 0,
    attempts: 0,
    duplicateAttempts: 0,
    sessions: 0,
    expiredSessions: 0,
    studyResponses: 0,
    duplicateStudyResponses: 0,
    orphans: 0,
  };

  await client.transaction(async (tx) => {
    const { rows } = await tx.query("SELECT COUNT(*)::int AS total FROM users");
    if (rows[0].total > 0) {
      throw new Error("O banco de destino já tem usuários. A importação só roda num banco vazio.");
    }

    const userIds = new Set();
    for (const rawUser of data.users) {
      const user = hydrateUser(rawUser);
      await insertUser(user, tx);
      userIds.add(user.id);
      report.users += 1;
    }

    const seenAttempts = new Set();
    for (const rawAttempt of data.challengeAttempts || []) {
      const attempt = hydrateAttempt(rawAttempt);
      const key = `${attempt.userId}:${attempt.challengeId}`;

      if (!userIds.has(attempt.userId)) {
        report.orphans += 1;
        continue;
      }

      // Tentativas duplicadas vieram da condição de corrida antiga; fica só a primeira.
      if (seenAttempts.has(key)) {
        report.duplicateAttempts += 1;
        continue;
      }

      seenAttempts.add(key);
      await insertAttempt(attempt, tx);
      report.attempts += 1;
    }

    const now = Date.now();
    for (const session of data.sessions || []) {
      if (!userIds.has(session.userId)) {
        report.orphans += 1;
        continue;
      }

      if (!session.expiresAt || Date.parse(session.expiresAt) <= now) {
        report.expiredSessions += 1;
        continue;
      }

      await insertSession(
        {
          tokenHash: session.tokenHash,
          userId: session.userId,
          createdAt: session.createdAt || new Date().toISOString(),
          expiresAt: session.expiresAt,
        },
        tx
      );
      report.sessions += 1;
    }

    const seenResponses = new Set();
    for (const response of data.study_responses || []) {
      if (!userIds.has(response.userId)) {
        report.orphans += 1;
        continue;
      }

      const key = `${response.userId}:${response.type}`;
      if (seenResponses.has(key)) {
        report.duplicateStudyResponses += 1;
        continue;
      }

      seenResponses.add(key);

      await insertStudyResponse(
        {
          ...response,
          id: String(response.id || crypto.randomUUID()),
          submittedAt: response.submittedAt || new Date().toISOString(),
        },
        tx
      );
      report.studyResponses += 1;
    }
  });

  return report;
}

module.exports = {
  hydrateAttempt,
  importLegacyDatabase,
};
