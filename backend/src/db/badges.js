// Badges no banco (tabela badges) e o catálogo em memória (content/badgeCatalog.js).
const { getClient } = require("./client");
const badgeCatalog = require("../content/badgeCatalog");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

function rowToBadge(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    rule: row.rule,
    active: row.active,
    position: row.position,
  };
}

// Primeira inicialização com a migração 009: grava a semente (as badges que ficavam no código
// e as sugestões desativadas).
async function seedBadgesIfEmpty(db = getClient()) {
  const { rows } = await db.query("SELECT COUNT(*)::int AS total FROM badges");
  if (rows[0].total > 0) {
    return false;
  }

  await db.transaction(async (tx) => {
    for (const badge of badgeCatalog.seedBadgeEntries()) {
      await tx.query(
        `INSERT INTO badges (id, name, description, rarity, rule, active, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          badge.id,
          badge.name,
          badge.description,
          badge.rarity,
          JSON.stringify(badge.rule),
          badge.active,
          badge.position,
        ],
      );
    }
  });

  return true;
}

async function reloadBadges(db = getClient()) {
  const { rows } = await db.query("SELECT * FROM badges ORDER BY position, id");
  badgeCatalog.setBadges(rows.map(rowToBadge));
}

// --- Painel admin ---

async function listBadgesForAdmin(db = getClient()) {
  const { rows } = await db.query(`
    SELECT b.*, COALESCE(earned.total, 0)::int AS earned_count
    FROM badges b
    LEFT JOIN (
      SELECT badge_id, COUNT(*) AS total FROM user_badges GROUP BY badge_id
    ) earned ON earned.badge_id = b.id
    ORDER BY b.position, b.id
  `);

  return rows.map((row) => ({
    ...rowToBadge(row),
    earnedCount: row.earned_count,
    updatedAt: toIso(row.updated_at),
  }));
}

async function findBadgeForAdmin(id, db = getClient()) {
  return (await listBadgesForAdmin(db)).find((badge) => badge.id === id) || null;
}

async function insertBadge({ id, name, description, rarity, rule, updatedBy }, db = getClient()) {
  await db.query(
    `INSERT INTO badges (id, name, description, rarity, rule, active, position, updated_by)
     VALUES ($1, $2, $3, $4, $5, false,
             (SELECT COALESCE(MAX(position), 0) + 1 FROM badges), $6)`,
    [id, name, description, rarity, JSON.stringify(rule), updatedBy],
  );
}

async function updateBadge({ id, name, description, rarity, rule, updatedBy }, db = getClient()) {
  const { rows } = await db.query(
    `UPDATE badges
     SET name = $2, description = $3, rarity = $4, rule = $5, updated_by = $6, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id, name, description, rarity, JSON.stringify(rule), updatedBy],
  );
  return Boolean(rows[0]);
}

async function setBadgeActive(id, active, updatedBy, db = getClient()) {
  const { rows } = await db.query(
    "UPDATE badges SET active = $2, updated_by = $3, updated_at = now() WHERE id = $1 RETURNING id",
    [id, active, updatedBy],
  );
  return Boolean(rows[0]);
}

module.exports = {
  seedBadgesIfEmpty,
  reloadBadges,
  listBadgesForAdmin,
  findBadgeForAdmin,
  insertBadge,
  updateBadge,
  setBadgeActive,
};
