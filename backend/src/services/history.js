// Histórico de feedbacks e números da evolução, a partir das tentativas do usuário.
// Só entram tentativas de desafios que ainda existem (mesma regra do progresso).
const {
  getChallenges,
  getCategories,
  getChallengeVersion,
  countPublishedByCategory,
} = require("../content/catalog");
const { filterValidAttempts } = require("./gamification");

// Tendência: média das últimas N tentativas contra as N anteriores.
const TREND_WINDOW = 5;
const MIN_TREND_WINDOW = 2;

const average = (values) =>
  values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;

const byDate = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

function buildHistoryItem(attempt) {
  // A versão que a pessoa respondeu, mesmo que o desafio tenha mudado depois.
  const challenge = getChallengeVersion(attempt.challengeId, attempt.challengeVersion);
  const criteriaScores = Array.isArray(attempt.evaluation?.criteriaScores)
    ? attempt.evaluation.criteriaScores.map(({ criterio, nota }) => ({ criterio, nota }))
    : [];

  return {
    id: attempt.id,
    challengeId: attempt.challengeId,
    titulo: challenge.titulo,
    categoria: challenge.categoria,
    tipo: challenge.tipo,
    pergunta: challenge.pergunta,
    resposta: attempt.answer,
    nota: attempt.score,
    qualityTier: attempt.qualityTier,
    feedback: attempt.feedback,
    consequence: attempt.consequence,
    xpGanho: attempt.xpAwarded,
    evaluator: attempt.evaluator,
    criteriaScores,
    respondidoEm: attempt.createdAt,
  };
}

function buildTrend(sortedAttempts) {
  const window = Math.min(TREND_WINDOW, Math.floor(sortedAttempts.length / 2));

  if (window < MIN_TREND_WINDOW) {
    return null;
  }

  const recent = sortedAttempts.slice(-window).map((attempt) => attempt.score);
  const previous = sortedAttempts.slice(-2 * window, -window).map((attempt) => attempt.score);
  const recentAverage = average(recent);
  const previousAverage = average(previous);

  return {
    window,
    recentAverage,
    previousAverage,
    delta: recentAverage - previousAverage,
  };
}

function buildEvolution(attempts) {
  const valid = filterValidAttempts(attempts).sort(byDate);
  const categories = getCategories();

  return {
    completed: valid.length,
    totalChallenges: getChallenges().length,
    averageScore: average(valid.map((attempt) => attempt.score)),
    trend: buildTrend(valid),
    byCategory: categories.map((categoria) => {
      const scores = valid
        .filter(
          (attempt) =>
            getChallengeVersion(attempt.challengeId, attempt.challengeVersion)?.categoria ===
            categoria,
        )
        .map((attempt) => attempt.score);

      return {
        categoria,
        completed: scores.length,
        total: countPublishedByCategory(categoria),
        averageScore: average(scores),
        bestScore: scores.length ? Math.max(...scores) : null,
      };
    }),
  };
}

// Mais recentes primeiro.
function buildHistory(attempts) {
  return {
    evolution: buildEvolution(attempts),
    items: (attempts || [])
      .filter((attempt) => getChallengeVersion(attempt.challengeId, attempt.challengeVersion))
      .sort((a, b) => byDate(b, a))
      .map(buildHistoryItem),
  };
}

module.exports = {
  buildHistoryItem,
  buildEvolution,
  buildHistory,
};
