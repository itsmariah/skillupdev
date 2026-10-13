const { getClient } = require("./client");
const { hydrateUser } = require("../services/users");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// Converte a linha do banco para o mesmo formato de usuário que as regras de domínio usam.
function rowToUser(row, badges = []) {
  return hydrateUser({
    id: row.id,
    nome: row.nome,
    email: row.email,
    usuário: row.legacy_username,
    passwordHash: row.password_hash,
    isAdmin: row.is_admin,
    xp: row.xp,
    nivel: row.nivel,
    badges,
    avatarConfig: row.avatar_config,
    gamification: {
      perfectStreak: row.perfect_streak,
      dailyLoginStreak: row.daily_login_streak,
      lastDailyLoginDate: row.last_daily_login_date,
      idealAnswers: row.ideal_answers,
      lastRewardAt: toIso(row.last_reward_at),
    },
    studyPreDone: row.study_pre_done,
    studyPostDone: row.study_post_done,
    studyVersion: row.study_version,
    createdAt: toIso(row.created_at),
  });
}

// Colunas que mudam ao longo do uso (tudo menos id e created_at).
function toMutableColumns(user) {
  const gamification = user.gamification || {};

  return {
    nome: user.nome,
    email: user.email,
    legacy_username: user.usuário || null,
    password_hash: user.passwordHash,
    is_admin: Boolean(user.isAdmin),
    xp: Number(user.xp) || 0,
    nivel: Number(user.nivel) || 1,
    avatar_config: JSON.stringify(user.avatarConfig || {}),
    perfect_streak: Number(gamification.perfectStreak) || 0,
    daily_login_streak: Number(gamification.dailyLoginStreak) || 0,
    last_daily_login_date: gamification.lastDailyLoginDate || null,
    ideal_answers: Number(gamification.idealAnswers) || 0,
    last_reward_at: gamification.lastRewardAt || null,
    study_pre_done: Boolean(user.studyPreDone),
    study_post_done: Boolean(user.studyPostDone),
    study_version: user.studyVersion ?? null,
  };
}

async function findBadges(userId, db) {
  const { rows } = await db.query(
    "SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1 ORDER BY earned_at, badge_id",
    [userId],
  );

  return rows.map((row) => ({ id: row.badge_id, earnedAt: toIso(row.earned_at) }));
}

async function saveBadges(user, db) {
  for (const badge of user.badges || []) {
    await db.query(
      `INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, badge_id) DO NOTHING`,
      [user.id, badge.id, badge.earnedAt || new Date().toISOString()],
    );
  }
}

async function findUserBy(column, value, db, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM users WHERE ${column} = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [value],
  );

  if (!rows[0]) {
    return null;
  }

  return rowToUser(rows[0], await findBadges(rows[0].id, db));
}

function findUserById(id, db = getClient(), options) {
  return findUserBy("id", id, db, options);
}

function findUserByEmail(email, db = getClient()) {
  return findUserBy("email", email, db);
}

// Lista sem as badges: usada pelo painel do estudo, que não precisa delas.
async function listUsers(db = getClient()) {
  const { rows } = await db.query("SELECT * FROM users ORDER BY created_at, id");
  return rows.map((row) => rowToUser(row));
}

async function hasAdmin(db = getClient()) {
  const { rows } = await db.query("SELECT 1 FROM users WHERE is_admin LIMIT 1");
  return rows.length > 0;
}

async function insertUser(user, db = getClient()) {
  const columns = {
    id: user.id,
    ...toMutableColumns(user),
    created_at: user.createdAt || new Date().toISOString(),
  };
  const names = Object.keys(columns);

  await db.query(
    `INSERT INTO users (${names.join(", ")})
     VALUES (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
    Object.values(columns),
  );
  await saveBadges(user, db);
}

// Grava o estado atual do usuário (XP, gamificação, avatar, senha, estudo) e as badges novas.
async function saveUser(user, db = getClient()) {
  const columns = toMutableColumns(user);
  const names = Object.keys(columns);

  await db.query(
    `UPDATE users SET ${names.map((name, index) => `${name} = $${index + 1}`).join(", ")}
     WHERE id = $${names.length + 1}`,
    [...Object.values(columns), user.id],
  );
  await saveBadges(user, db);
}

async function deleteUser(id, db = getClient()) {
  await db.query("DELETE FROM users WHERE id = $1", [id]);
}

module.exports = {
  findUserById,
  findUserByEmail,
  listUsers,
  hasAdmin,
  insertUser,
  saveUser,
  deleteUser,
};
