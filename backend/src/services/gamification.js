const { APP_TIMEZONE } = require("../config");
const { CHALLENGES, VALID_CHALLENGE_IDS, ALL_CATEGORIES } = require("../content/challenges");

// XP por conclusão de desafio (base, antes de qualidade e multiplicador)
const CHALLENGE_COMPLETION_XP = 40;
// Bônus por resposta ideal; penalidade por baixa qualidade
const IDEAL_ANSWER_BONUS_XP = 60; // ideal total: 100 XP (× multiplicador)
const LOW_QUALITY_ADJUSTMENT_XP = -10; // baixa total:  30 XP (× multiplicador)
// Login diário — incentiva engajamento consistente
const DAILY_LOGIN_XP = 20;
// Sequência perfeita — 5 ideais consecutivos para acionar bônus
const PERFECT_STREAK_TARGET = 5;
const PERFECT_STREAK_BONUS_XP = 80;
const OPEN_CHALLENGE_IDEAL_SCORE = 85;
const OPEN_CHALLENGE_MEDIUM_SCORE = 60;

// Tabela de níveis — crescimento progressivo
// Nível 2: ~4–5 desafios ideais (gancho de engajamento inicial)
// Nível 3: ~11–12 desafios (1–2 semanas de uso regular)
// Nível 4: ~25–28 desafios + logins (3–5 semanas)
// Nível 5: todos os 30 desafios + ~80–130 dias de login diário
const LEVELS = [
  { level: 1, title: "Trainee Soft Skills", minXp: 0 },
  { level: 2, title: "Colaborador", minXp: 400 },
  { level: 3, title: "Profissional Colaborativo", minXp: 1100 },
  { level: 4, title: "Dev Influente", minXp: 2600 },
  { level: 5, title: "Soft Skill Master", minXp: 5200 },
];

const DEFAULT_AVATAR = {
  cabelo: "short",
  roupa: "hoodie",
  cor: "indigo",
  acessorio: "none",
  tom: "warm",
  cabelo_cor: "dark",
  expressao: "happy",
};

const AVATAR_CATALOG = {
  cabelo: [
    { id: "short", label: "Curto", minLevel: 1 },
    { id: "curly", label: "Cacheado", minLevel: 1 },
    { id: "shortcurly", label: "Curto Cacheado", minLevel: 1 },
    { id: "long", label: "Longo", minLevel: 1 },
    { id: "wavy", label: "Ondulado", minLevel: 2 },
    { id: "braids", label: "Tranças", minLevel: 2 },
    { id: "ponytail", label: "Rabo de cavalo", minLevel: 3 },
    { id: "bun", label: "Coque", minLevel: 3 },
    { id: "spiky", label: "Pontudo", minLevel: 4 },
    { id: "mohawk", label: "Moicano", minLevel: 5 },
  ],
  roupa: [
    { id: "hoodie", label: "Moletom", minLevel: 1 },
    { id: "jacket", label: "Jaqueta", minLevel: 1 },
    { id: "blazer", label: "Blazer", minLevel: 3 },
    { id: "cape", label: "Capa tech", minLevel: 5 },
  ],
  cor: [
    { id: "indigo", label: "Indigo", value: "#5b6cff", secondary: "#8994ff", minLevel: 1 },
    { id: "teal", label: "Teal", value: "#0ea5a1", secondary: "#58d7cf", minLevel: 1 },
    { id: "sunset", label: "Sunset", value: "#f97316", secondary: "#fdba74", minLevel: 2 },
    { id: "rose", label: "Rose", value: "#e11d48", secondary: "#fb7185", minLevel: 3 },
    { id: "gold", label: "Gold", value: "#d4a017", secondary: "#f5d36f", minLevel: 5 },
  ],
  acessorio: [
    { id: "none", label: "Nenhum", minLevel: 1 },
    { id: "glasses", label: "Óculos", minLevel: 1 },
    { id: "headset", label: "Headset", minLevel: 2 },
    { id: "badge", label: "Broche", minLevel: 3 },
    { id: "crown", label: "Coroa", minLevel: 5 },
  ],
  tom: [
    { id: "warm", label: "Quente", skin: "#f2c7a5", neck: "#e6b792", minLevel: 1 },
    { id: "light", label: "Clara", skin: "#f9e0c6", neck: "#f0c8a8", minLevel: 1 },
    { id: "medium", label: "Média", skin: "#d4a574", neck: "#bf9060", minLevel: 1 },
    { id: "tan", label: "Bronzeada", skin: "#b07850", neck: "#976640", minLevel: 1 },
    { id: "dark", label: "Escura", skin: "#8d5524", neck: "#7a4a1e", minLevel: 1 },
  ],
  cabelo_cor: [
    { id: "dark", label: "Preto", value: "#2d2842", minLevel: 1 },
    { id: "brown", label: "Castanho", value: "#6b4226", minLevel: 1 },
    { id: "blonde", label: "Loiro", value: "#d4a017", minLevel: 1 },
    { id: "red", label: "Ruivo", value: "#b83221", minLevel: 2 },
    { id: "blue", label: "Azul", value: "#5b6cff", minLevel: 3 },
    { id: "pink", label: "Rosa", value: "#e11d48", minLevel: 4 },
  ],
  expressao: [
    { id: "happy", label: "Alegre", minLevel: 1 },
    { id: "cool", label: "Cool", minLevel: 1 },
    { id: "focused", label: "Focado", minLevel: 2 },
    { id: "surprised", label: "Surpreso", minLevel: 3 },
  ],
};

const BADGE_XP = { comum: 50, raro: 100, epico: 200, lendario: 400 };

const BADGE_DEFINITIONS = [
  // ── Comum ─────────────────────────────────────────────────────────────────
  {
    id: "first-mission",
    name: "Primeira Missão",
    description: "Conclua seu primeiro desafio na plataforma.",
    theme: "beginner",
    rarity: "comum",
    predicate(context) {
      return context.attempts.length >= 1;
    },
  },
  {
    id: "communicator-beginner",
    name: "Comunicador Iniciante",
    description: "Complete 3 desafios de Comunicação.",
    theme: "communication",
    rarity: "comum",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Comunicação") >= 3;
    },
  },
  {
    id: "explorer",
    name: "Explorador",
    description: "Complete ao menos 1 desafio em 3 categorias diferentes.",
    theme: "exploration",
    rarity: "comum",
    predicate(context) {
      return countCategoriesWithAttempts(context.attempts) >= 3;
    },
  },
  // ── Raro ──────────────────────────────────────────────────────────────────
  {
    id: "collaborative-dev",
    name: "Dev Colaborativo",
    description: "Complete todos os 6 desafios de Trabalho em Equipe.",
    theme: "teamwork",
    rarity: "raro",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Trabalho em Equipe") >= 6;
    },
  },
  {
    id: "time-master",
    name: "Mestre do Tempo",
    description: "Complete todos os 6 desafios de Gestão de Tempo.",
    theme: "time",
    rarity: "raro",
    predicate(context) {
      return countAttemptsByCategory(context.attempts, "Gestão de Tempo") >= 6;
    },
  },
  {
    id: "conflict-mediator",
    name: "Mediador de Conflitos",
    description: "Obtenha resposta ideal nos dois desafios de conflito entre colegas.",
    theme: "teamwork",
    rarity: "raro",
    predicate(context) {
      return (
        hasIdealAttempt(context.attempts, "teamwork-closed-2") &&
        hasIdealAttempt(context.attempts, "teamwork-open-2")
      );
    },
  },
  // ── Épico ─────────────────────────────────────────────────────────────────
  {
    id: "specialist",
    name: "Especialista",
    description: "Complete todos os desafios de 4 categorias diferentes.",
    theme: "mastery",
    rarity: "epico",
    predicate(context) {
      return countCompletedCategories(context.attempts) >= 4;
    },
  },
  {
    id: "perfectionist",
    name: "Perfeccionista",
    description: "Acumule 15 respostas ideais no total.",
    theme: "quality",
    rarity: "epico",
    predicate(context) {
      return countIdealAttempts(context.attempts) >= 15;
    },
  },
  {
    id: "leader-in-formation",
    name: "Líder em Formação",
    description: "Alcance o nível 3.",
    theme: "leadership",
    rarity: "epico",
    predicate(context) {
      return context.level >= 3;
    },
  },
  // ── Lendário ──────────────────────────────────────────────────────────────
  {
    id: "legendary-streak",
    name: "Sequência Lendária",
    description: `Alcance ${PERFECT_STREAK_TARGET} respostas ideais consecutivas.`,
    theme: "streak",
    rarity: "lendario",
    predicate(context) {
      return (context.gamification.perfectStreak || 0) >= PERFECT_STREAK_TARGET;
    },
  },
  {
    id: "full-dev",
    name: "360° Dev",
    description: "Complete todos os 30 desafios da plataforma.",
    theme: "master",
    rarity: "lendario",
    predicate(context) {
      return context.attempts.length >= 30;
    },
  },
  {
    id: "soft-skill-master",
    name: "Soft Skill Master",
    description: "Alcance o nível máximo da plataforma.",
    theme: "legendary",
    rarity: "lendario",
    predicate(context) {
      return context.level >= 5;
    },
  },
];

// Data (AAAA-MM-DD) no fuso da aplicação: o "dia" do bônus diário vira à meia-noite local,
// não à meia-noite UTC (21h em Brasília).
function getTodayKey(date = new Date(), timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isYesterdayKey(dateKey, todayKey = getTodayKey()) {
  if (!dateKey) {
    return false;
  }

  const today = new Date(`${todayKey}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() - 1);

  return dateKey === today.toISOString().slice(0, 10);
}

function getLevelDetails(xp) {
  const safeXp = Math.max(Number(xp) || 0, 0);
  let currentLevel = LEVELS[0];

  for (const level of LEVELS) {
    if (safeXp >= level.minXp) {
      currentLevel = level;
    }
  }

  return currentLevel;
}

function getNextLevel(level) {
  return LEVELS.find((item) => item.level === level + 1) || null;
}

function calculateLevel(xp) {
  return getLevelDetails(xp).level;
}

function buildAvatarCatalog(level) {
  return Object.fromEntries(
    Object.entries(AVATAR_CATALOG).map(([key, options]) => [
      key,
      options.map((option) => ({
        ...option,
        unlocked: option.minLevel <= level,
      })),
    ]),
  );
}

function getFallbackAvatarOption(category, level) {
  const options = AVATAR_CATALOG[category] || [];
  return options.find((option) => option.minLevel <= level) || options[0];
}

function normalizeAvatarSelection(category, selectedId, level) {
  const options = AVATAR_CATALOG[category] || [];
  const selected = options.find((option) => option.id === selectedId && option.minLevel <= level);

  if (selected) {
    return selected.id;
  }

  return getFallbackAvatarOption(category, level)?.id || "";
}

function normalizeAvatarConfig(config, xp) {
  const level = getLevelDetails(xp).level;
  const source = config || DEFAULT_AVATAR;

  return {
    cabelo: normalizeAvatarSelection("cabelo", source.cabelo, level),
    roupa: normalizeAvatarSelection("roupa", source.roupa, level),
    cor: normalizeAvatarSelection("cor", source.cor, level),
    acessorio: normalizeAvatarSelection("acessorio", source.acessorio, level),
    tom: normalizeAvatarSelection("tom", source.tom || "warm", level),
    cabelo_cor: normalizeAvatarSelection("cabelo_cor", source.cabelo_cor || "dark", level),
    expressao: normalizeAvatarSelection("expressao", source.expressao || "happy", level),
  };
}

function createDefaultGamificationState() {
  return {
    perfectStreak: 0,
    dailyLoginStreak: 0,
    lastDailyLoginDate: null,
    idealAnswers: 0,
    lastRewardAt: null,
  };
}

function deriveQualityTier(score, challengeType = "aberto") {
  const safeScore = Number(score) || 0;

  if (challengeType === "fechado") {
    if (safeScore >= 85) {
      return "ideal";
    }

    if (safeScore >= 40) {
      return "medium";
    }

    return "low";
  }

  if (safeScore >= OPEN_CHALLENGE_IDEAL_SCORE) {
    return "ideal";
  }

  if (safeScore >= OPEN_CHALLENGE_MEDIUM_SCORE) {
    return "medium";
  }

  return "low";
}

// Ignora tentativas de desafios que não existem mais no catálogo.
function filterValidAttempts(attempts) {
  return (attempts || []).filter((attempt) => VALID_CHALLENGE_IDS.has(attempt.challengeId));
}

function countAttemptsByCategory(attempts, category) {
  return attempts.filter((attempt) => attempt.category === category).length;
}

function hasIdealAttempt(attempts, challengeId) {
  return attempts.some((attempt) => attempt.challengeId === challengeId && attempt.wasIdeal);
}

function countIdealAttempts(attempts) {
  return attempts.filter((attempt) => attempt.wasIdeal).length;
}

function countCategoriesWithAttempts(attempts) {
  return ALL_CATEGORIES.filter((cat) => countAttemptsByCategory(attempts, cat) >= 1).length;
}

function countCompletedCategories(attempts) {
  return ALL_CATEGORIES.filter((cat) => countAttemptsByCategory(attempts, cat) >= 6).length;
}

function getProgress(xp) {
  const safeXp = Math.max(Number(xp) || 0, 0);
  const currentLevel = getLevelDetails(safeXp);
  const nextLevel = getNextLevel(currentLevel.level);

  if (!nextLevel) {
    return {
      xp: safeXp,
      level: currentLevel.level,
      levelLabel: currentLevel.title,
      currentLevelXp: safeXp - currentLevel.minXp,
      nextLevelXp: safeXp,
      xpToNextLevel: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const levelSpan = nextLevel.minXp - currentLevel.minXp;
  const currentLevelXp = safeXp - currentLevel.minXp;

  return {
    xp: safeXp,
    level: currentLevel.level,
    levelLabel: currentLevel.title,
    currentLevelXp,
    nextLevelXp: levelSpan,
    xpToNextLevel: Math.max(nextLevel.minXp - safeXp, 0),
    progressPercent: Math.min(100, Math.round((currentLevelXp / levelSpan) * 100)),
    isMaxLevel: false,
  };
}

function buildBadgeCatalog(user, userAttempts) {
  const attempts = filterValidAttempts(userAttempts);
  const level = getLevelDetails(user.xp).level;
  const savedBadges = new Map((user.badges || []).map((badge) => [badge.id, badge]));
  const context = { attempts, level, gamification: user.gamification || {} };

  return BADGE_DEFINITIONS.map((definition) => {
    const savedBadge = savedBadges.get(definition.id);
    const unlocked = Boolean(savedBadge) || definition.predicate(context);

    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      theme: definition.theme,
      rarity: definition.rarity || "comum",
      unlocked,
      earnedAt: savedBadge?.earnedAt || null,
    };
  });
}

function syncBadges(user, userAttempts) {
  const attempts = filterValidAttempts(userAttempts);
  const level = getLevelDetails(user.xp).level;
  const existingIds = new Set((user.badges || []).map((badge) => badge.id));
  const unlockedNow = [];
  const context = { attempts, level, gamification: user.gamification || {} };

  for (const definition of BADGE_DEFINITIONS) {
    if (definition.predicate(context) && !existingIds.has(definition.id)) {
      const rarity = definition.rarity || "comum";
      const xpBonus = BADGE_XP[rarity] || 0;

      const badge = {
        id: definition.id,
        earnedAt: new Date().toISOString(),
      };

      user.badges.push(badge);
      existingIds.add(definition.id);
      user.xp = Math.max(0, (Number(user.xp) || 0) + xpBonus);
      user.nivel = calculateLevel(user.xp);

      unlockedNow.push({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        theme: definition.theme,
        rarity,
        xpBonus,
        unlocked: true,
        earnedAt: badge.earnedAt,
      });
    }
  }

  return unlockedNow;
}

function buildCategoryProgress(attempts) {
  return Array.from(new Set(CHALLENGES.map((challenge) => challenge.categoria))).map(
    (categoria) => {
      const total = CHALLENGES.filter((challenge) => challenge.categoria === categoria).length;
      const completed = countAttemptsByCategory(attempts, categoria);

      return {
        categoria,
        completed,
        total,
      };
    },
  );
}

function applyDailyLoginReward(user) {
  const todayKey = getTodayKey();

  if (user.gamification.lastDailyLoginDate === todayKey) {
    return null;
  }

  user.xp += DAILY_LOGIN_XP;
  user.nivel = calculateLevel(user.xp);
  user.avatarConfig = normalizeAvatarConfig(user.avatarConfig, user.xp);
  user.gamification.dailyLoginStreak = isYesterdayKey(
    user.gamification.lastDailyLoginDate,
    todayKey,
  )
    ? (Number(user.gamification.dailyLoginStreak) || 0) + 1
    : 1;
  user.gamification.lastDailyLoginDate = todayKey;
  user.gamification.lastRewardAt = new Date().toISOString();

  return {
    label: "Bônus de acesso diário",
    xp: DAILY_LOGIN_XP,
  };
}

// O que cada desafio vale, calculado pelas mesmas regras do XP de verdade
// (inclui o multiplicador dos desafios abertos). Usado nos textos da interface.
function buildRewardSummary(challenge) {
  const xpMultiplier = Number(challenge?.xpMultiplier) || 1;
  const total = (qualityTier) =>
    buildXpBreakdown(qualityTier, 0, xpMultiplier).reduce((sum, item) => sum + item.xp, 0);

  return {
    conclusionXp: total("medium"),
    idealTotalXp: total("ideal"),
    perfectStreakTarget: PERFECT_STREAK_TARGET,
    perfectStreakBonusXp: PERFECT_STREAK_BONUS_XP,
  };
}

function buildChallengeConsequence(qualityTier) {
  if (qualityTier === "ideal") {
    return "Sua decisão tende a aumentar a confiança, reduzir atrito e melhorar o resultado do cenário.";
  }

  if (qualityTier === "medium") {
    return "Sua escolha pode funcionar parcialmente, mas ainda deixa espaço para ruído, retrabalho ou tensão.";
  }

  return "Sua resposta tende a ampliar o problema ou reduzir a confiança das pessoas envolvidas.";
}

function buildXpBreakdown(qualityTier, streakBonusXp, xpMultiplier = 1) {
  const qualityAdjustmentXp =
    qualityTier === "ideal"
      ? IDEAL_ANSWER_BONUS_XP
      : qualityTier === "low"
        ? LOW_QUALITY_ADJUSTMENT_XP
        : 0;

  const completionXp = Math.round(CHALLENGE_COMPLETION_XP * xpMultiplier);
  const qualityXp = Math.round(qualityAdjustmentXp * xpMultiplier);

  const breakdown = [
    { label: "Desafio concluído", xp: completionXp },
    { label: "Qualidade da resposta", xp: qualityXp },
  ];

  if (streakBonusXp > 0) {
    breakdown.push({
      label: `Sequência perfeita x${PERFECT_STREAK_TARGET}`,
      xp: streakBonusXp,
    });
  }

  return breakdown;
}

function buildChallengeResult({ challenge, score, feedback, previousStreak }) {
  const qualityTier = deriveQualityTier(score, challenge.tipo);
  const nextPerfectStreak =
    qualityTier === "ideal"
      ? previousStreak + 1
      : qualityTier === "medium" && challenge.tipo === "aberto"
        ? previousStreak
        : 0;
  const streakBonusXp =
    nextPerfectStreak > 0 && nextPerfectStreak % PERFECT_STREAK_TARGET === 0
      ? PERFECT_STREAK_BONUS_XP
      : 0;
  const xpMultiplier = Number(challenge.xpMultiplier) || 1;
  const xpBreakdown = buildXpBreakdown(qualityTier, streakBonusXp, xpMultiplier);
  const xpGanho = xpBreakdown.reduce((total, item) => total + item.xp, 0);

  return {
    challengeId: challenge.id,
    qualityTier,
    wasIdeal: qualityTier === "ideal",
    feedback,
    nota: score,
    consequence: buildChallengeConsequence(qualityTier),
    xpBreakdown,
    xpGanho,
    perfectStreak: nextPerfectStreak,
  };
}

module.exports = {
  CHALLENGE_COMPLETION_XP,
  IDEAL_ANSWER_BONUS_XP,
  LOW_QUALITY_ADJUSTMENT_XP,
  DAILY_LOGIN_XP,
  PERFECT_STREAK_TARGET,
  PERFECT_STREAK_BONUS_XP,
  OPEN_CHALLENGE_IDEAL_SCORE,
  OPEN_CHALLENGE_MEDIUM_SCORE,
  LEVELS,
  DEFAULT_AVATAR,
  AVATAR_CATALOG,
  BADGE_XP,
  BADGE_DEFINITIONS,
  getTodayKey,
  isYesterdayKey,
  getLevelDetails,
  getNextLevel,
  calculateLevel,
  buildAvatarCatalog,
  getFallbackAvatarOption,
  normalizeAvatarSelection,
  normalizeAvatarConfig,
  createDefaultGamificationState,
  deriveQualityTier,
  filterValidAttempts,
  countAttemptsByCategory,
  hasIdealAttempt,
  countIdealAttempts,
  countCategoriesWithAttempts,
  countCompletedCategories,
  getProgress,
  buildBadgeCatalog,
  syncBadges,
  buildCategoryProgress,
  applyDailyLoginReward,
  buildRewardSummary,
  buildChallengeConsequence,
  buildXpBreakdown,
  buildChallengeResult,
};
