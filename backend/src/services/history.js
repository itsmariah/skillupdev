// Histórico de feedbacks e números da evolução, a partir das tentativas do usuário.
// O histórico lista todas as tentativas; os números usam a última tentativa de cada desafio
// (nível atual), a melhor (melhor nota) e a sequência cronológica (tendência). Revisões de
// desafios fechados não entram nos números.
const {
  getChallenges,
  getCategories,
  getChallengeVersion,
  countPublishedByCategory,
  isPublished,
} = require("../content/catalog");
const { COMPETENCIES } = require("../content/competencies");
const {
  filterValidAttempts,
  countedAttempts,
  latestAttemptPerChallenge,
  isReviewAttempt,
} = require("./gamification");

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
    tentativa: Number(attempt.attemptNumber) || 1,
    revisao: isReviewAttempt(attempt),
    disponivel: isPublished(attempt.challengeId),
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

const challengeOf = (attempt) => getChallengeVersion(attempt.challengeId, attempt.challengeVersion);

// Nota da tentativa numa habilidade: a nota que a IA deu àquela habilidade, quando existe;
// senão (fechados, avaliação de reserva), a nota da resposta.
function skillScoreOf(attempt, skill) {
  const criterion = attempt.evaluation?.criteriaScores?.find(
    (item) => item.criterio === skill.nome,
  );
  return criterion ? Number(criterion.nota) : Number(attempt.score);
}

// Nível atual em cada habilidade: média das últimas tentativas dos desafios que a exercitam.
function buildSkillScores(currentAttempts) {
  return COMPETENCIES.map((competency) => {
    const habilidades = competency.habilidades.map((skill) => {
      const scores = currentAttempts
        .filter((attempt) => challengeOf(attempt)?.habilidades?.includes(skill.id))
        .map((attempt) => skillScoreOf(attempt, skill));

      return { id: skill.id, nome: skill.nome, score: average(scores), desafios: scores.length };
    });
    const scored = habilidades.filter((skill) => skill.score !== null).map((skill) => skill.score);

    return {
      id: competency.id,
      nome: competency.nome,
      score: average(scored),
      habilidades,
    };
  });
}

function buildEvolution(attempts) {
  const current = latestAttemptPerChallenge(attempts);
  const best = filterValidAttempts(attempts);
  const chronological = countedAttempts(attempts).sort(byDate);

  return {
    completed: current.length,
    totalChallenges: getChallenges().length,
    averageScore: average(current.map((attempt) => attempt.score)),
    trend: buildTrend(chronological),
    byCategory: getCategories().map((categoria) => {
      const inCategory = (attempt) => challengeOf(attempt)?.categoria === categoria;
      const scores = current.filter(inCategory).map((attempt) => attempt.score);
      const bestScores = best.filter(inCategory).map((attempt) => attempt.score);

      return {
        categoria,
        completed: scores.length,
        total: countPublishedByCategory(categoria),
        averageScore: average(scores),
        bestScore: bestScores.length ? Math.max(...bestScores) : null,
      };
    }),
    competencias: buildSkillScores(current),
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
  buildSkillScores,
  buildHistoryItem,
  buildEvolution,
  buildHistory,
};
