// Exportação dos dados da conta (portabilidade, LGPD art. 18, V): tudo o que a plataforma
// guarda sobre a pessoa, num JSON legível. Fica de fora só o que é segredo do sistema:
// hash da senha e tokens de sessão ou de redefinição.
const { getChallengeVersion } = require("../content/catalog");

const EXPORT_FORMAT_VERSION = 1;

function buildAccountExport({ user, attempts, studyResponses, exportedAt = new Date() }) {
  return {
    formato: { nome: "skillupdev-export", versao: EXPORT_FORMAT_VERSION },
    exportadoEm: exportedAt.toISOString(),
    conta: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      papel: user.role,
      criadaEm: user.createdAt || null,
      termosAceitos: user.termsVersion
        ? { versao: user.termsVersion, aceitosEm: user.termsAcceptedAt }
        : null,
    },
    progresso: {
      xp: user.xp,
      nivel: user.nivel,
      gamificacao: user.gamification,
      badges: user.badges,
      avatar: user.avatarConfig,
    },
    tentativas: attempts.map((attempt) => ({
      desafio: {
        id: attempt.challengeId,
        titulo: getChallengeVersion(attempt.challengeId, attempt.challengeVersion)?.titulo || null,
        versao: attempt.challengeVersion ?? null,
        categoria: attempt.category,
        tipo: attempt.challengeType,
      },
      resposta: attempt.answer,
      nota: attempt.score,
      qualidade: attempt.qualityTier,
      feedback: attempt.feedback,
      consequencia: attempt.consequence,
      xpGanho: attempt.xpAwarded,
      detalhamentoXp: attempt.xpBreakdown,
      badgesDesbloqueadas: attempt.unlockedBadges,
      avaliador: attempt.evaluator,
      avaliacao: attempt.evaluation,
      respondidaEm: attempt.createdAt,
      tentativa: attempt.attemptNumber ?? 1,
      reflexao: attempt.reflection
        ? { texto: attempt.reflection, atualizadaEm: attempt.reflectionUpdatedAt }
        : null,
    })),
    estudoPiloto: studyResponses.map((response) => ({
      questionario: response.type,
      versaoDoEstudo: response.studyVersion,
      enviadoEm: response.submittedAt,
      respostas: response.data,
    })),
  };
}

function exportFileName(exportedAt = new Date()) {
  return `skillupdev-meus-dados-${exportedAt.toISOString().slice(0, 10)}.json`;
}

module.exports = {
  buildAccountExport,
  exportFileName,
};
