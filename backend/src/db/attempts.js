const { getClient } = require("./client");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

function rowToAttempt(row) {
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    challengeVersion: row.challenge_version,
    challengeType: row.challenge_type,
    category: row.category,
    answer: row.answer,
    feedback: row.feedback,
    consequence: row.consequence,
    score: row.score,
    qualityTier: row.quality_tier,
    wasIdeal: row.was_ideal,
    xpAwarded: row.xp_awarded,
    xpBreakdown: row.xp_breakdown,
    unlockedBadges: row.unlocked_badges,
    evaluator: row.evaluator,
    evaluation: row.evaluation,
    createdAt: toIso(row.created_at),
  };
}

async function listAttemptsByUser(userId, db = getClient()) {
  const { rows } = await db.query(
    "SELECT * FROM challenge_attempts WHERE user_id = $1 ORDER BY created_at, id",
    [userId],
  );
  return rows.map(rowToAttempt);
}

async function findAttempt(userId, challengeId, db = getClient()) {
  const { rows } = await db.query(
    "SELECT * FROM challenge_attempts WHERE user_id = $1 AND challenge_id = $2",
    [userId, challengeId],
  );
  return rows[0] ? rowToAttempt(rows[0]) : null;
}

// Lança erro de violação única se o usuário já tiver tentativa nesse desafio.
async function insertAttempt(attempt, db = getClient()) {
  await db.query(
    `INSERT INTO challenge_attempts (
       id, user_id, challenge_id, challenge_type, category, answer, feedback, consequence,
       score, quality_tier, was_ideal, xp_awarded, xp_breakdown, unlocked_badges, created_at,
       evaluator, evaluation, challenge_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      attempt.id,
      attempt.userId,
      attempt.challengeId,
      attempt.challengeType || null,
      attempt.category || "",
      attempt.answer || "",
      attempt.feedback || "",
      attempt.consequence ?? null,
      Number(attempt.score) || 0,
      attempt.qualityTier,
      Boolean(attempt.wasIdeal),
      Number(attempt.xpAwarded) || 0,
      JSON.stringify(attempt.xpBreakdown || []),
      JSON.stringify(attempt.unlockedBadges || []),
      attempt.createdAt || new Date().toISOString(),
      attempt.evaluator || null,
      attempt.evaluation ? JSON.stringify(attempt.evaluation) : null,
      attempt.challengeVersion ?? null,
    ],
  );
}

// Total de tentativas por usuário (inclui desafios que não existem mais, como antes).
async function countAttemptsByUser(db = getClient()) {
  const { rows } = await db.query(
    "SELECT user_id, COUNT(*)::int AS total FROM challenge_attempts GROUP BY user_id",
  );
  return new Map(rows.map((row) => [row.user_id, row.total]));
}

module.exports = {
  listAttemptsByUser,
  findAttempt,
  insertAttempt,
  countAttemptsByUser,
};
