const { getClient } = require("./client");

function rowToSummary(row) {
  return row
    ? {
        userId: row.user_id,
        summary: row.summary,
        attemptsCount: row.attempts_count,
        evaluator: row.evaluator,
        meta: row.meta,
        generatedAt:
          row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
      }
    : null;
}

async function findCoachSummary(userId, db = getClient()) {
  const { rows } = await db.query("SELECT * FROM coach_summaries WHERE user_id = $1", [userId]);
  return rowToSummary(rows[0]);
}

// Um resumo por pessoa: gerar de novo substitui o anterior.
async function saveCoachSummary(
  { userId, summary, attemptsCount, evaluator, meta },
  db = getClient(),
) {
  const { rows } = await db.query(
    `INSERT INTO coach_summaries (user_id, summary, attempts_count, evaluator, meta, generated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       attempts_count = EXCLUDED.attempts_count,
       evaluator = EXCLUDED.evaluator,
       meta = EXCLUDED.meta,
       generated_at = EXCLUDED.generated_at
     RETURNING *`,
    [userId, JSON.stringify(summary), attemptsCount, evaluator, meta ? JSON.stringify(meta) : null],
  );
  return rowToSummary(rows[0]);
}

module.exports = {
  findCoachSummary,
  saveCoachSummary,
};
