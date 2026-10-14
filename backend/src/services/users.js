const { CHALLENGES } = require("../content/challenges");
const { normalizeEmail } = require("../lib/text");
const {
  getTodayKey,
  PERFECT_STREAK_TARGET,
  PERFECT_STREAK_BONUS_XP,
  DAILY_LOGIN_XP,
  calculateLevel,
  buildAvatarCatalog,
  normalizeAvatarConfig,
  createDefaultGamificationState,
  filterValidAttempts,
  getProgress,
  buildBadgeCatalog,
  buildCategoryProgress,
} = require("./gamification");
const { resolveRole } = require("./roles");

function hydrateUser(user) {
  const xp = Math.max(Number(user?.xp) || 0, 0);
  const level = calculateLevel(xp);
  const nome = String(user?.nome || user?.usuário || "Dev").trim();
  // O papel substitui o antigo isAdmin, que não segue adiante no objeto.
  const rest = { ...user };
  delete rest.isAdmin;

  return {
    ...rest,
    role: resolveRole(user),
    nome,
    email: normalizeEmail(user?.email),
    usuário: user?.usuário || null,
    xp,
    nivel: level,
    badges: Array.isArray(user?.badges) ? user.badges.filter((badge) => badge?.id) : [],
    avatarConfig: normalizeAvatarConfig(user?.avatarConfig, xp),
    gamification: {
      ...createDefaultGamificationState(),
      ...(user?.gamification || {}),
    },
  };
}

function buildUserResponse(user, userAttempts) {
  const progress = getProgress(user.xp);
  const attempts = filterValidAttempts(userAttempts);
  const badgeCatalog = buildBadgeCatalog(user, userAttempts);
  const unlockedBadges = badgeCatalog.filter((badge) => badge.unlocked);

  return {
    id: user.id,
    nome: user.nome,
    usuário: user.usuário,
    email: user.email,
    ...progress,
    completedChallenges: attempts.length,
    totalChallenges: CHALLENGES.length,
    pendingChallenges: Math.max(CHALLENGES.length - attempts.length, 0),
    categoryProgress: buildCategoryProgress(attempts),
    badges: unlockedBadges,
    badgeCatalog,
    avatarConfig: normalizeAvatarConfig(user.avatarConfig, user.xp),
    avatarCatalog: buildAvatarCatalog(progress.level),
    gamification: {
      perfectStreak: Number(user.gamification?.perfectStreak) || 0,
      dailyLoginStreak: Number(user.gamification?.dailyLoginStreak) || 0,
      idealAnswers: Number(user.gamification?.idealAnswers) || 0,
      dailyLoginAwardedToday: user.gamification?.lastDailyLoginDate === getTodayKey(),
      totalBadges: unlockedBadges.length,
      perfectStreakTarget: PERFECT_STREAK_TARGET,
      perfectStreakBonusXp: PERFECT_STREAK_BONUS_XP,
      dailyLoginXp: DAILY_LOGIN_XP,
    },
    role: resolveRole(user),
    createdAt: user.createdAt || null,
    studyPreDone: Boolean(user.studyPreDone),
    studyPostDone: Boolean(user.studyPostDone),
  };
}

module.exports = {
  hydrateUser,
  buildUserResponse,
};
