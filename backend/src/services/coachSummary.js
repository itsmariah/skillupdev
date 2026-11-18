// Resumo de evolução (roadmap Fase 4): um texto curto de coach sobre como a pessoa está indo.
// A IA recebe só números agregados e títulos de desafios: nenhuma resposta, reflexão, nome ou
// e-mail sai da plataforma por aqui. Sem IA (ou se ela falhar), um texto montado por regras.
const { OPENAI_MODEL } = require("../config");
const { buildEvolution } = require("./history");
const { countedAttempts, latestAttemptPerChallenge } = require("./gamification");
const { getChallengeVersion } = require("../content/catalog");
const { callOpenAI } = require("./openai");

const SUMMARY_PROMPT_VERSION = "2026-11-summary-v1";
// Com menos desafios respondidos, não há evolução para resumir.
const MIN_CHALLENGES_FOR_SUMMARY = 3;
const RECENT_ATTEMPTS = 5;
// Variação da média recente a partir da qual a tendência é "subiu" ou "caiu".
const TREND_THRESHOLD = 5;

const SUMMARY_SCHEMA = {
  name: "resumo_de_evolucao",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resumo", "pontos_fortes", "foco"],
    properties: {
      resumo: { type: "string" },
      pontos_fortes: { type: "string" },
      foco: { type: "string" },
    },
  },
};

const SUMMARY_SYSTEM_PROMPT = [
  "Você é um coach de soft skills para desenvolvedores de software.",
  "Você recebe, em JSON, os números de evolução de uma pessoa numa plataforma de desafios",
  "(notas de 0 a 100; fraca abaixo de 60, boa de 60 a 84, ideal a partir de 85).",
  "Cada competência (ex.: Comunicação) agrupa habilidades (ex.: Empatia). Fale das habilidades",
  "pelo nome e não chame uma competência de habilidade.",
  "",
  'Escreva em português, falando com a pessoa ("você"):',
  "- resumo: 2 frases sobre como ela está evoluindo, usando a tendência e as notas.",
  "- pontos_fortes: 1 frase sobre as habilidades em habilidadesMaisFortes.",
  "- foco: 1 a 2 frases sobre habilidadeMaisFraca e por que vale praticá-la. Se houver",
  "  proximoPasso, termine indicando esse desafio pelo título.",
  "",
  "Regras:",
  "- Use só os números e nomes recebidos. Não invente conquistas, desafios nem notas.",
  "- Seja específico e direto: nada de frases motivacionais genéricas.",
  "- Com poucos dados, diga que o retrato ainda é parcial.",
].join("\n");

const scoredSkills = (evolution) =>
  evolution.competencias.flatMap((competency) =>
    competency.habilidades
      .filter((skill) => skill.score !== null)
      .map((skill) => ({ ...skill, competencia: competency.nome })),
  );

// O que vai para a IA: só agregados e títulos (conteúdo da plataforma, não da pessoa).
function buildSummaryInput(attempts, recommendations = []) {
  const evolution = buildEvolution(attempts);
  const ranked = scoredSkills(evolution).sort((a, b) => b.score - a.score);
  const weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const recent = countedAttempts(attempts)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-RECENT_ATTEMPTS)
    .map((attempt) => {
      const challenge = getChallengeVersion(attempt.challengeId, attempt.challengeVersion);
      return {
        desafio: challenge?.titulo || attempt.challengeId,
        competencia: challenge?.categoria || attempt.category,
        nota: attempt.score,
        tentativa: Number(attempt.attemptNumber) || 1,
      };
    });
  const next = recommendations[0];

  return {
    desafiosConcluidos: evolution.completed,
    totalDeDesafios: evolution.totalChallenges,
    notaMedia: evolution.averageScore,
    tendencia: evolution.trend
      ? {
          tentativasComparadas: evolution.trend.window,
          mediaRecente: evolution.trend.recentAverage,
          mediaAnterior: evolution.trend.previousAverage,
        }
      : null,
    competencias: evolution.competencias
      .filter((competency) => competency.score !== null)
      .map((competency) => ({
        nome: competency.nome,
        nota: competency.score,
        habilidades: competency.habilidades
          .filter((skill) => skill.score !== null)
          .map((skill) => ({ nome: skill.nome, nota: skill.score })),
      })),
    ultimasTentativas: recent,
    // Calculados aqui para o texto não depender de o modelo achar os extremos no JSON.
    habilidadesMaisFortes: ranked.slice(0, 2).map(({ nome, score }) => ({ nome, nota: score })),
    habilidadeMaisFraca: weakest ? { nome: weakest.nome, nota: weakest.score } : null,
    proximoPasso: next ? { desafio: next.desafio.titulo, motivo: next.motivo } : null,
  };
}

function buildSummaryMessages(input) {
  return [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: `<dados>\n${JSON.stringify(input, null, 2)}\n</dados>` },
  ];
}

// Texto por regras: o mesmo formato, a partir dos mesmos números.
function buildHeuristicSummary(attempts, recommendations = []) {
  const evolution = buildEvolution(attempts);
  const skills = scoredSkills(evolution).sort((a, b) => b.score - a.score);
  const trend = evolution.trend;

  let trendText = "Ainda são poucas tentativas para ver uma tendência.";
  if (trend) {
    const change = `${trend.previousAverage} → ${trend.recentAverage}`;
    trendText =
      trend.delta >= TREND_THRESHOLD
        ? `Suas notas recentes subiram (média ${change}).`
        : trend.delta <= -TREND_THRESHOLD
          ? `Suas notas recentes caíram (média ${change}).`
          : `Suas notas recentes estão estáveis (média ${change}).`;
  }

  const strongest = skills[0];
  const weakest = skills.length > 1 ? skills[skills.length - 1] : null;
  const next = recommendations[0];

  return {
    resumo: `Você concluiu ${evolution.completed} de ${evolution.totalChallenges} desafios, com nota média ${evolution.averageScore}. ${trendText}`,
    pontosFortes: strongest
      ? `Seu ponto mais forte hoje é ${strongest.nome} (${strongest.score}).`
      : "Responda mais desafios para ver seus pontos fortes.",
    foco: [
      weakest ? `Vale praticar ${weakest.nome} (${weakest.score}).` : "",
      next ? `Próximo passo sugerido: ${next.desafio.titulo}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function canSummarize(attempts) {
  return latestAttemptPerChallenge(attempts || []).length >= MIN_CHALLENGES_FOR_SUMMARY;
}

function heuristicResult(attempts, recommendations, fallbackReason) {
  return {
    summary: buildHeuristicSummary(attempts, recommendations),
    evaluator: "heuristic",
    meta: { fallbackReason },
  };
}

async function generateCoachSummary(attempts, recommendations = []) {
  if (!process.env.OPENAI_API_KEY) {
    return heuristicResult(attempts, recommendations, "OPENAI_API_KEY não configurada");
  }

  const startedAt = Date.now();

  try {
    const { parsed, data } = await callOpenAI(
      buildSummaryMessages(buildSummaryInput(attempts, recommendations)),
      SUMMARY_SCHEMA,
      { feature: "resumo" },
    );
    const summary = {
      resumo: String(parsed?.resumo || "").trim(),
      pontosFortes: String(parsed?.pontos_fortes || "").trim(),
      foco: String(parsed?.foco || "").trim(),
    };

    if (!summary.resumo || !summary.foco) {
      throw new Error("Resumo fora do formato esperado.");
    }

    return {
      summary,
      evaluator: "ai",
      meta: {
        model: data?.model || OPENAI_MODEL,
        promptVersion: SUMMARY_PROMPT_VERSION,
        tokens: data?.usage?.total_tokens ?? null,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    console.error("Erro ao gerar o resumo de evolução com IA. Usando texto por regras.", error);
    return heuristicResult(attempts, recommendations, error.message);
  }
}

module.exports = {
  SUMMARY_PROMPT_VERSION,
  MIN_CHALLENGES_FOR_SUMMARY,
  buildSummaryInput,
  buildSummaryMessages,
  buildHeuristicSummary,
  canSummarize,
  generateCoachSummary,
};
