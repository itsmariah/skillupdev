const { OPENAI_MODEL, OPENAI_TIMEOUT_MS } = require("../config");
const { normalizeTextValue } = require("../lib/text");
const { OPEN_CHALLENGE_IDEAL_SCORE, OPEN_CHALLENGE_MEDIUM_SCORE } = require("./gamification");

const CRITERIA_KEYWORDS = {
  empatia: ["entendo", "compreendo", "desculpe", "ajudar", "obrigado"],
  clareza: ["objetivo", "claro", "explicar", "resumo", "passo"],
  "postura emocional": ["calma", "tranquilo", "serenidade", "entendo", "vamos"],
  simplificacao: ["simples", "analogia", "exemplo", "facil", "resumindo"],
  didatica: ["passo", "etapa", "explico", "porque", "impacto"],
  "ausencia de jargao": ["simples", "claro", "sem termo tecnico", "facil"],
  respeito: ["respeito", "podemos", "sugiro", "percebi", "melhorar"],
  assertividade: ["direto", "objetivo", "proponho", "precisa", "recomendo"],
  colaboracao: ["equipe", "junto", "time", "alinhar", "colaborar"],
  lideranca: ["organizar", "delegar", "priorizar", "direcionar", "coordenar"],
  organizacao: ["plano", "ordem", "etapas", "mapear", "organizar"],
  mediacao: ["ouvir", "mediar", "consenso", "facilitar", "conciliar"],
  neutralidade: ["ambos", "critérios", "sem lado", "equilibrio", "imparcial"],
  comunicacao: ["alinhar", "conversar", "explicar", "escutar", "mensagem"],
  "pensamento critico": ["trade-off", "impacto", "critério", "risco", "beneficio"],
  analise: ["pros", "contras", "avaliar", "comparar", "critério"],
  metodo: ["diagnosticar", "isolar", "confirmar", "validar", "hipotese"],
  priorizacao: ["priorizar", "impacto", "urgência", "ordem", "primeiro"],
  "visao de produto": ["usuário", "produto", "negócio", "impacto", "valor"],
  responsabilidade: ["assumir", "comunicar", "resolver", "acompanhar", "compromisso"],
  investigacao: ["log", "hipotese", "causa", "evidencia", "investigar"],
  "uso de dados": ["metrica", "log", "dado", "observacao", "monitoramento"],
  "raciocinio logico": ["hipotese", "causa", "teste", "validar", "evidencia"],
  planejamento: ["planejar", "mapear", "etapa", "estimar", "organizar"],
  "gestao de tempo": ["agenda", "bloco", "priorizar", "prazo", "foco"],
  "analise de impacto": ["impacto", "risco", "valor", "dependencia", "resultado"],
  criterio: ["critério", "avaliar", "comparar", "decidir", "peso"],
  decomposicao: ["quebrar", "subtarefa", "etapa", "dividir", "bloco"],
  maturidade: ["ouvir", "aprender", "refletir", "melhorar", "aceitar"],
  aprendizado: ["aprender", "ajustar", "evoluir", "melhorar", "licao"],
  "controle emocional": ["calma", "respirar", "equilibrio", "serenidade", "controle"],
  negociacao: ["negociar", "escopo", "prazo", "alinhamento", "combinar"],
  resiliencia: ["seguir", "reconstruir", "adaptar", "recuperar", "persistir"],
  reflexao: ["refletir", "entender", "analisar", "post-mortem", "aprendizado"],
};

function getCriteriaMatches(answer, criteria) {
  const normalizedAnswer = normalizeTextValue(answer);
  const uniqueCriteria = Array.from(new Set((criteria || []).map(normalizeTextValue)));

  return uniqueCriteria.filter((critérion) => {
    const keywords = CRITERIA_KEYWORDS[critérion] || [];
    return keywords.some((keyword) => normalizedAnswer.includes(normalizeTextValue(keyword)));
  });
}

function buildHeuristicFeedback(answer, criteria = []) {
  const cleanAnswer = String(answer || "").trim();
  const normalizedAnswer = normalizeTextValue(cleanAnswer);
  const words = cleanAnswer.split(/\s+/).filter(Boolean);
  const generalKeywords = [
    "entendo",
    "vamos",
    "alinhar",
    "explicar",
    "impacto",
    "resolver",
    "priorizar",
    "organizar",
  ];
  const matchedCriteria = getCriteriaMatches(cleanAnswer, criteria);
  const missingCriteria = (criteria || []).filter(
    (critérion) => !matchedCriteria.includes(normalizeTextValue(critérion))
  );

  let score = 35;

  if (words.length >= 12) score += 15;
  if (words.length >= 24) score += 10;
  if (words.length >= 40) score += 10;
  if (generalKeywords.some((keyword) => normalizedAnswer.includes(keyword))) score += 10;
  score += Math.min(matchedCriteria.length * 10, 30);

  const finalScore = Math.max(35, Math.min(score, 100));

  let feedback;

  if (words.length < 8) {
    feedback = "A resposta está muito curta para ser avaliada com precisão. Desenvolva melhor sua linha de raciocínio, explique o contexto e detalhe como agiria na situação.";
  } else if (finalScore >= OPEN_CHALLENGE_IDEAL_SCORE) {
    feedback = "Boa resposta. Você demonstrou maturidade, contexto e um encaminhamento claro para a situação.";
    if (missingCriteria.length > 0) {
      feedback += ` Reforce especialmente ${missingCriteria.slice(0, 2).join(" e ")}.`;
    }
  } else if (finalScore >= OPEN_CHALLENGE_MEDIUM_SCORE) {
    feedback = "A resposta mostra boa intenção e uma linha de raciocínio útil, mas ainda pode ficar mais forte.";
    if (missingCriteria.length > 0) {
      feedback += ` Reforce especialmente ${missingCriteria.slice(0, 2).join(" e ")}.`;
    }
  } else {
    feedback = "A resposta precisa de mais desenvolvimento.";
    if (missingCriteria.length > 0) {
      feedback += ` Trabalhe especialmente ${missingCriteria.slice(0, 2).join(" e ")}.`;
    } else {
      feedback += " Estruture melhor suas ideias, seja mais específico e detalhe como agiria na situação.";
    }
  }

  return {
    nota: finalScore,
    feedback,
  };
}

function extractJsonObject(text) {
  const rawText = String(text || "").trim();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (_secondError) {
      return null;
    }
  }
}

async function evaluateOpenChallengeWithAI({ resposta, challenge }) {
  const criteria =
    Array.isArray(challenge.criteriosAvaliacao) && challenge.criteriosAvaliacao.length
      ? challenge.criteriosAvaliacao
      : ["clareza", "empatia", "adequacao ao cenário"];

  if (!process.env.OPENAI_API_KEY) {
    return buildHeuristicFeedback(resposta, criteria);
  }

  const prompt = [
    "Você é um avaliador especialista em soft skills para desenvolvedores de software.",
    "Avalie a resposta abaixo e forneça um feedback detalhado, específico e educativo.",
    "",
    `Categoria: ${challenge.categoria}`,
    `Desafio: ${challenge.titulo}`,
    `Pergunta: ${challenge.pergunta}`,
    `Resposta do usuário: ${resposta}`,
    "",
    `Critérios avaliados: ${criteria.join(", ")}`,
    "",
    "Estruture o feedback em exatamente três partes:",
    "1. O que foi bem: destaque 1-2 pontos fortes concretos da resposta.",
    "2. O que faltou: aponte 1-2 lacunas ou pontos que ficaram fracos, sendo específico sobre o que estava ausente.",
    "3. Como melhorar: dê uma dica prática e acionável para evoluir nessa competência.",
    "",
    "Seja direto e específico sobre esta resposta — nunca genérico. Use no máximo 6 frases no total.",
    'Retorne apenas JSON válido: {"nota": 0-100, "feedback": "texto com as três partes claramente separadas"}',
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OpenAI retornou status ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJsonObject(content);

    if (!parsed) {
      throw new Error("Não foi possível interpretar o JSON da avaliação.");
    }

    return {
      nota: Math.max(0, Math.min(Number(parsed.nota) || 0, 100)),
      feedback:
        String(parsed.feedback || "").trim() ||
        "Sua resposta foi avaliada, mas o feedback voltou vazio.",
    };
  } catch (error) {
    console.error("Erro ao avaliar resposta com IA. Usando fallback local.", error);
    return buildHeuristicFeedback(resposta, criteria);
  }
}

module.exports = {
  CRITERIA_KEYWORDS,
  getCriteriaMatches,
  buildHeuristicFeedback,
  extractJsonObject,
  evaluateOpenChallengeWithAI,
};
