// Tipos de regra das badges. Cada badge guarda { tipo, ...parâmetros } e o painel admin só
// oferece estes tipos: a regra é dado, não código, então nada do que vem do painel é executado.
// O contexto da avaliação usa uma tentativa por desafio (a melhor; ver filterValidAttempts),
// então as badges contam desafios, não tentativas.
const { COMPETENCIES, DIFFICULTIES, DIFFICULTY_IDS } = require("./competencies");
const { getChallenges, getChallengeById, countPublishedByCategory } = require("./catalog");

const CATEGORY_NAMES = COMPETENCIES.map((competency) => competency.nome);
const MAX_LEVEL = 5;
const MAX_REQUIRED_CHALLENGES = 10;

// Tipos de parâmetro: como validar e como o painel monta o campo.
const PARAM_KINDS = {
  quantidade: { label: "Quantidade", kind: "inteiro", min: 1, max: 500 },
  competencia: { label: "Competência", kind: "competencia" },
  dificuldade: { label: "Nível da trilha", kind: "dificuldade" },
  nivel: { label: "Nível de XP", kind: "inteiro", min: 1, max: MAX_LEVEL },
  desafios: { label: "Desafios", kind: "desafios" },
};

const inCategory = (attempts, categoria) =>
  categoria ? attempts.filter((attempt) => attempt.category === categoria) : attempts;

const inDifficulty = (attempts, dificuldade) =>
  dificuldade
    ? attempts.filter(
        (attempt) => getChallengeById(attempt.challengeId)?.dificuldade === dificuldade,
      )
    : attempts;

// Competência completa = todos os desafios publicados dela respondidos.
function isCategoryComplete(attempts, categoria) {
  const total = countPublishedByCategory(categoria);
  return total > 0 && inCategory(attempts, categoria).length >= total;
}

const RULE_TYPES = [
  {
    tipo: "desafios_concluidos",
    nome: "Concluir desafios",
    descricao: "Concluir N desafios, opcionalmente de uma competência e/ou de um nível.",
    params: { quantidade: true, competencia: false, dificuldade: false },
    evaluate: (context, { quantidade, competencia, dificuldade }) =>
      inDifficulty(inCategory(context.attempts, competencia), dificuldade).length >= quantidade,
  },
  {
    tipo: "respostas_ideais",
    nome: "Respostas ideais",
    descricao: "Chegar à resposta ideal em N desafios, opcionalmente de uma competência.",
    params: { quantidade: true, competencia: false },
    evaluate: (context, { quantidade, competencia }) =>
      inCategory(context.attempts, competencia).filter((attempt) => attempt.wasIdeal).length >=
      quantidade,
  },
  {
    tipo: "competencias_exploradas",
    nome: "Explorar competências",
    descricao: "Concluir ao menos um desafio em N competências diferentes.",
    params: { quantidade: true },
    evaluate: (context, { quantidade }) =>
      new Set(context.attempts.map((attempt) => attempt.category)).size >= quantidade,
  },
  {
    tipo: "competencia_completa",
    nome: "Completar uma competência",
    descricao: "Concluir todos os desafios publicados de uma competência.",
    params: { competencia: true },
    evaluate: (context, { competencia }) => isCategoryComplete(context.attempts, competencia),
  },
  {
    tipo: "competencias_completas",
    nome: "Completar várias competências",
    descricao: "Concluir todos os desafios publicados de N competências.",
    params: { quantidade: true },
    evaluate: (context, { quantidade }) =>
      CATEGORY_NAMES.filter((categoria) => isCategoryComplete(context.attempts, categoria))
        .length >= quantidade,
  },
  {
    tipo: "nivel_trilha_concluido",
    nome: "Concluir um nível da trilha",
    descricao: "Concluir todos os desafios publicados de um nível na trilha de uma competência.",
    params: { competencia: true, dificuldade: true },
    evaluate: (context, { competencia, dificuldade }) => {
      const total = getChallenges().filter(
        (challenge) => challenge.categoria === competencia && challenge.dificuldade === dificuldade,
      ).length;
      return (
        total > 0 &&
        inDifficulty(inCategory(context.attempts, competencia), dificuldade).length >= total
      );
    },
  },
  {
    tipo: "todos_os_desafios",
    nome: "Concluir todos os desafios",
    descricao: "Concluir todos os desafios publicados da plataforma.",
    params: {},
    evaluate: (context) =>
      getChallenges().length > 0 && context.attempts.length >= getChallenges().length,
  },
  {
    tipo: "ideal_nos_desafios",
    nome: "Ideal em desafios específicos",
    descricao: "Chegar à resposta ideal em todos os desafios escolhidos.",
    params: { desafios: true },
    evaluate: (context, { desafios }) =>
      desafios.every((id) =>
        context.attempts.some((attempt) => attempt.challengeId === id && attempt.wasIdeal),
      ),
  },
  {
    tipo: "nivel_xp",
    nome: "Alcançar um nível de XP",
    descricao: "Chegar a um nível da plataforma pelo XP acumulado.",
    params: { nivel: true },
    evaluate: (context, { nivel }) => context.level >= nivel,
  },
  {
    tipo: "sequencia_perfeita",
    nome: "Sequência de respostas ideais",
    descricao: "Chegar a N respostas ideais seguidas (na primeira resposta de cada desafio).",
    params: { quantidade: true },
    evaluate: (context, { quantidade }) =>
      (Number(context.gamification.perfectStreak) || 0) >= quantidade,
  },
];

const RULE_TYPES_BY_ID = new Map(RULE_TYPES.map((type) => [type.tipo, type]));

function evaluateRule(rule, context) {
  const type = RULE_TYPES_BY_ID.get(rule?.tipo);
  return Boolean(type) && type.evaluate(context, rule);
}

// Valida e normaliza a regra que veio do painel: só os parâmetros do tipo, nos formatos certos.
// knownChallengeIds: ids existentes (publicados ou não) para a regra de desafios específicos.
function validateRule(input, knownChallengeIds = new Set()) {
  const errors = [];
  const type = RULE_TYPES_BY_ID.get(String(input?.tipo || ""));

  if (!type) {
    return { errors: ["Regra: escolha um dos tipos disponíveis."], rule: null };
  }

  const rule = { tipo: type.tipo };

  for (const [name, required] of Object.entries(type.params)) {
    const spec = PARAM_KINDS[name];
    const raw = input[name];
    const empty = raw === undefined || raw === null || raw === "";

    if (empty) {
      if (required) errors.push(`Regra: o campo "${spec.label}" é obrigatório.`);
      continue;
    }

    if (spec.kind === "inteiro") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
        errors.push(
          `Regra: ${spec.label.toLowerCase()} deve ser um número de ${spec.min} a ${spec.max}.`,
        );
      } else {
        rule[name] = value;
      }
    } else if (spec.kind === "competencia") {
      if (!CATEGORY_NAMES.includes(raw)) {
        errors.push("Regra: escolha uma competência existente.");
      } else {
        rule[name] = raw;
      }
    } else if (spec.kind === "dificuldade") {
      if (!DIFFICULTY_IDS.includes(raw)) {
        errors.push("Regra: escolha básico, intermediário ou avançado.");
      } else {
        rule[name] = raw;
      }
    } else if (spec.kind === "desafios") {
      const ids = Array.isArray(raw) ? [...new Set(raw.map((id) => String(id).trim()))] : [];
      if (ids.length === 0 || ids.length > MAX_REQUIRED_CHALLENGES) {
        errors.push(`Regra: escolha de 1 a ${MAX_REQUIRED_CHALLENGES} desafios.`);
      } else if (ids.some((id) => !knownChallengeIds.has(id))) {
        errors.push("Regra: algum desafio escolhido não existe.");
      } else {
        rule[name] = ids;
      }
    }
  }

  return { errors, rule };
}

// Versão pública dos tipos, para o painel montar o formulário.
function buildPublicRuleTypes() {
  return {
    tipos: RULE_TYPES.map(({ tipo, nome, descricao, params }) => ({
      tipo,
      nome,
      descricao,
      params: Object.entries(params).map(([name, required]) => ({
        name,
        required,
        ...PARAM_KINDS[name],
      })),
    })),
    competencias: CATEGORY_NAMES,
    dificuldades: DIFFICULTIES,
  };
}

module.exports = {
  RULE_TYPES,
  evaluateRule,
  validateRule,
  buildPublicRuleTypes,
};
