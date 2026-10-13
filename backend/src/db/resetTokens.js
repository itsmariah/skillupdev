const { getClient } = require("./client");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

async function insertResetToken(record, db = getClient()) {
  await db.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [record.id, record.userId, record.tokenHash, record.createdAt, record.expiresAt]
  );
}

async function findActiveResetToken(tokenHash, db = getClient()) {
  const { rows } = await db.query(
    `SELECT id, user_id, expires_at FROM password_reset_tokens
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );

  return rows[0]
    ? { id: rows[0].id, userId: rows[0].user_id, expiresAt: toIso(rows[0].expires_at) }
    : null;
}

async function deleteResetTokensByUser(userId, db = getClient()) {
  await db.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
}

async function purgeExpiredResetTokens(db = getClient()) {
  await db.query("DELETE FROM password_reset_tokens WHERE expires_at <= now()");
}

module.exports = {
  insertResetToken,
  findActiveResetToken,
  deleteResetTokensByUser,
  purgeExpiredResetTokens,
};
