const crypto = require("crypto");

const { PASSWORD_RESET_TTL_MS } = require("../config");

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");

  if (candidate.length !== hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createPasswordResetToken(userId) {
  const rawToken = createToken();
  const createdAt = new Date();

  return {
    rawToken,
    record: {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashToken(rawToken),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
    },
  };
}

function findPasswordResetToken(database, rawToken) {
  const tokenHash = hashToken(rawToken);

  return (database.passwordResetTokens || []).find((resetToken) => {
    if (!resetToken?.tokenHash || resetToken.tokenHash.length !== tokenHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(resetToken.tokenHash, "hex"),
      Buffer.from(tokenHash, "hex")
    );
  });
}

module.exports = {
  createPasswordHash,
  verifyPassword,
  createToken,
  hashToken,
  createPasswordResetToken,
  findPasswordResetToken,
};
