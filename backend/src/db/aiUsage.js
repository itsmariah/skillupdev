const { getClient } = require("./client");

async function recordAiUsage(entry, db = getClient()) {
  await db.query(
    `INSERT INTO ai_usage (feature, model, ok, error, prompt_tokens, completion_tokens,
       total_tokens, latency_ms, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.feature,
      entry.model,
      entry.ok,
      entry.error,
      entry.promptTokens,
      entry.completionTokens,
      entry.totalTokens,
      Math.round(entry.latencyMs),
      entry.costUsd,
    ],
  );
}

const num = (value) => (value === null || value === undefined ? null : Number(value));

// Totais por recurso e por dia desde `since`, com os dias contados no fuso `timeZone`, e o
// custo do mês corrente (também no fuso) para comparar com o orçamento.
async function summarizeAiUsage({ since, timeZone }, db = getClient()) {
  const { rows: byFeature } = await db.query(
    `SELECT feature,
            COUNT(*)::int AS calls,
            COUNT(*) FILTER (WHERE NOT ok)::int AS errors,
            COALESCE(SUM(total_tokens), 0)::bigint AS tokens,
            COALESCE(SUM(cost_usd), 0) AS cost,
            AVG(latency_ms) FILTER (WHERE ok) AS avg_latency,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p95_latency
     FROM ai_usage WHERE created_at >= $1
     GROUP BY feature ORDER BY cost DESC, feature`,
    [since],
  );

  const { rows: byDay } = await db.query(
    `SELECT to_char(date_trunc('day', created_at AT TIME ZONE $2), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS calls,
            COUNT(*) FILTER (WHERE NOT ok)::int AS errors,
            COALESCE(SUM(cost_usd), 0) AS cost,
            AVG(latency_ms) FILTER (WHERE ok) AS avg_latency
     FROM ai_usage WHERE created_at >= $1
     GROUP BY 1 ORDER BY 1 DESC`,
    [since, timeZone],
  );

  const { rows: month } = await db.query(
    `SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*)::int AS calls
     FROM ai_usage
     WHERE date_trunc('month', created_at AT TIME ZONE $1) = date_trunc('month', now() AT TIME ZONE $1)`,
    [timeZone],
  );

  const { rows: recentErrors } = await db.query(
    `SELECT feature, error, created_at FROM ai_usage
     WHERE NOT ok AND created_at >= $1 ORDER BY created_at DESC LIMIT 10`,
    [since],
  );

  return {
    byFeature: byFeature.map((row) => ({
      feature: row.feature,
      calls: row.calls,
      errors: row.errors,
      tokens: Number(row.tokens),
      costUsd: num(row.cost),
      avgLatencyMs: row.avg_latency === null ? null : Math.round(Number(row.avg_latency)),
      p95LatencyMs: row.p95_latency === null ? null : Math.round(Number(row.p95_latency)),
    })),
    byDay: byDay.map((row) => ({
      day: row.day,
      calls: row.calls,
      errors: row.errors,
      costUsd: num(row.cost),
      avgLatencyMs: row.avg_latency === null ? null : Math.round(Number(row.avg_latency)),
    })),
    month: { costUsd: num(month[0].cost), calls: month[0].calls },
    recentErrors: recentErrors.map((row) => ({
      feature: row.feature,
      error: row.error,
      at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    })),
  };
}

module.exports = {
  recordAiUsage,
  summarizeAiUsage,
};
