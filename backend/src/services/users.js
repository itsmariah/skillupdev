const { CHALLENGES } = require("../content/challenges");
const { normalizeEmail } = require("../lib/text");
const {
  getTodayKey,
  calculateLevel,
  buildAvatarCatalog,
  normalizeAvatarConfig,
  createDefaultGamificationState,
  filterValidAttempts,
  getProgress,
  buildBadgeCatalog,
  buildCategoryProgress,
} = require("./gamification");

function hydrateUser(user) {
  const xp = Math.max(Number(user?.xp) || 0, 0);
  const level = calculateLevel(xp);
  const nome = String(user?.nome || user?.usuário || "Dev").trim();

  return {
    ...user,
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
    },
    isAdmin: Boolean(user.isAdmin),
    studyPreDone: Boolean(user.studyPreDone),
    studyPostDone: Boolean(user.studyPostDone),
  };
}

module.exports = {
  hydrateUser,
  buildUserResponse,
};
