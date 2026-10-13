const { getClient } = require("./client");

async function insertSession(session, db = getClient()) {
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [session.tokenHash, session.userId, session.createdAt, session.expiresAt]
  );
}

async function findActiveSession(tokenHash, db = getClient()) {
  const { rows } = await db.query(
    "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash]
  );
  return rows[0] ? { tokenHash, userId: rows[0].user_id } : null;
}

async function deleteSession(tokenHash, db = getClient()) {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

async function deleteSessionsByUser(userId, db = getClient()) {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

async function purgeExpiredSessions(db = getClient()) {
  await db.query("DELETE FROM sessions WHERE expires_at <= now()");
}

module.exports = {
  insertSession,
  findActiveSession,
  deleteSession,
  deleteSessionsByUser,
  purgeExpiredSessions,
};
