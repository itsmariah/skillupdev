// Desafios no banco: identidade/estado (challenges) e conteúdo versionado (challenge_versions).
// Versão publicada não muda. Um rascunho é a versão mais recente ainda sem published_at.
const { getClient } = require("./client");
const catalog = require("../content/catalog");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// Primeira inicialização com a migração 005: grava os desafios da semente como versão 1
// publicada e liga as tentativas antigas a essa versão.
async function seedChallengesIfEmpty(db = getClient()) {
  const { rows } = await db.query("SELECT COUNT(*)::int AS total FROM challenges");
  if (rows[0].total > 0) {
    return false;
  }

  await db.transaction(async (tx) => {
    for (const entry of catalog.seedEntries()) {
      await tx.query(
        `INSERT INTO challenges (id, tipo, status, published_version, position)
         VALUES ($1, $2, 'publicado', 1, $3)`,
        [entry.id, entry.tipo, entry.position],
      );
      await tx.query(
        `INSERT INTO challenge_versions (challenge_id, version, content, published_at)
         VALUES ($1, 1, $2, now())`,
        [entry.id, JSON.stringify(entry.versions[0].content)],
      );
    }
    await tx.query(
      "UPDATE challenge_attempts SET challenge_version = 1 WHERE challenge_version IS NULL",
    );
  });

  return true;
}

async function loadCatalogEntries(db = getClient()) {
  const { rows: challenges } = await db.query("SELECT * FROM challenges ORDER BY position, id");
  const { rows: versions } = await db.query(
    "SELECT challenge_id, version, content FROM challenge_versions ORDER BY challenge_id, version",
  );

  return challenges.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    publishedVersion: row.published_version,
    position: row.position,
    versions: versions
      .filter((version) => version.challenge_id === row.id)
      .map((version) => ({ version: version.version, content: version.content })),
  }));
}

// Recarrega o catálogo em memória a partir do banco (após publicar ou arquivar).
async function reloadCatalog(db = getClient()) {
  catalog.setCatalog(await loadCatalogEntries(db));
}

// --- Painel admin ---

async function listChallengesForAdmin(db = getClient()) {
  const { rows } = await db.query(`
    SELECT c.*,
           latest.version AS latest_version,
           latest.content AS latest_content,
           latest.published_at IS NULL AS has_draft,
           COALESCE(stats.attempts, 0)::int AS attempts
    FROM challenges c
    JOIN LATERAL (
      SELECT version, content, published_at FROM challenge_versions v
      WHERE v.challenge_id = c.id ORDER BY version DESC LIMIT 1
    ) latest ON true
    LEFT JOIN (
      SELECT challenge_id, COUNT(*) AS attempts FROM challenge_attempts GROUP BY challenge_id
    ) stats ON stats.challenge_id = c.id
    ORDER BY c.position, c.id
  `);

  return rows.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    publishedVersion: row.published_version,
    latestVersion: row.latest_version,
    hasDraft: row.has_draft,
    titulo: row.latest_content.titulo,
    categoria: row.latest_content.categoria,
    dificuldade: row.latest_content.dificuldade || null,
    attempts: row.attempts,
    updatedAt: toIso(row.updated_at),
  }));
}

async function findChallengeForAdmin(id, db = getClient()) {
  const { rows } = await db.query("SELECT * FROM challenges WHERE id = $1", [id]);
  if (!rows[0]) {
    return null;
  }

  const { rows: versions } = await db.query(
    `SELECT v.version, v.content, v.created_at, v.published_at, u.nome AS created_by_name
     FROM challenge_versions v LEFT JOIN users u ON u.id = v.created_by
     WHERE v.challenge_id = $1 ORDER BY v.version DESC`,
    [id],
  );
  const { rows: stats } = await db.query(
    "SELECT COUNT(*)::int AS total FROM challenge_attempts WHERE challenge_id = $1",
    [id],
  );

  const row = rows[0];
  const draft = versions.find((version) => !version.published_at) || null;
  const publishedRow = versions.find((version) => version.version === row.published_version);

  return {
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    publishedVersion: row.published_version,
    attempts: stats[0].total,
    published: publishedRow ? publishedRow.content : null,
    draft: draft ? { version: draft.version, content: draft.content } : null,
    versions: versions.map((version) => ({
      version: version.version,
      createdAt: toIso(version.created_at),
      publishedAt: toIso(version.published_at),
      createdBy: version.created_by_name || null,
      isPublished: version.version === row.published_version,
    })),
  };
}

async function insertChallengeDraft({ id, tipo, content, createdBy }, db = getClient()) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM challenges",
    );
    await tx.query(
      "INSERT INTO challenges (id, tipo, status, position) VALUES ($1, $2, 'rascunho', $3)",
      [id, tipo, rows[0].next],
    );
    await tx.query(
      "INSERT INTO challenge_versions (challenge_id, version, content, created_by) VALUES ($1, 1, $2, $3)",
      [id, JSON.stringify(content), createdBy],
    );
  });
}

// Atualiza o rascunho existente ou cria um novo (próxima versão) a partir do publicado.
async function saveChallengeDraft({ id, content, createdBy }, db = getClient()) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT version, published_at FROM challenge_versions
       WHERE challenge_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [id],
    );
    const latest = rows[0];

    if (latest && !latest.published_at) {
      await tx.query(
        `UPDATE challenge_versions SET content = $3, created_by = $4, created_at = now()
         WHERE challenge_id = $1 AND version = $2`,
        [id, latest.version, JSON.stringify(content), createdBy],
      );
      await tx.query("UPDATE challenges SET updated_at = now() WHERE id = $1", [id]);
      return latest.version;
    }

    const version = (latest?.version || 0) + 1;
    await tx.query(
      "INSERT INTO challenge_versions (challenge_id, version, content, created_by) VALUES ($1, $2, $3, $4)",
      [id, version, JSON.stringify(content), createdBy],
    );
    await tx.query("UPDATE challenges SET updated_at = now() WHERE id = $1", [id]);
    return version;
  });
}

// Publica o rascunho: ele vira a versão atual e o desafio volta a aparecer (se arquivado).
async function publishChallengeDraft(id, db = getClient()) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE challenge_versions SET published_at = now()
       WHERE challenge_id = $1 AND published_at IS NULL
       RETURNING version`,
      [id],
    );
    if (!rows[0]) {
      return null;
    }
    await tx.query(
      `UPDATE challenges SET published_version = $2, status = 'publicado', updated_at = now()
       WHERE id = $1`,
      [id, rows[0].version],
    );
    return rows[0].version;
  });
}

// Descarta o rascunho. Um desafio que nunca foi publicado é removido por inteiro.
async function discardChallengeDraft(id, db = getClient()) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT published_version FROM challenges WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) {
      return "missing";
    }
    if (!rows[0].published_version) {
      await tx.query("DELETE FROM challenges WHERE id = $1", [id]);
      return "deleted";
    }
    const { rows: removed } = await tx.query(
      "DELETE FROM challenge_versions WHERE challenge_id = $1 AND published_at IS NULL RETURNING version",
      [id],
    );
    return removed.length > 0 ? "discarded" : "none";
  });
}

async function setChallengeStatus(id, status, db = getClient()) {
  const { rows } = await db.query(
    `UPDATE challenges SET status = $2, updated_at = now()
     WHERE id = $1 AND published_version IS NOT NULL RETURNING id`,
    [id, status],
  );
  return Boolean(rows[0]);
}

module.exports = {
  seedChallengesIfEmpty,
  loadCatalogEntries,
  reloadCatalog,
  listChallengesForAdmin,
  findChallengeForAdmin,
  insertChallengeDraft,
  saveChallengeDraft,
  publishChallengeDraft,
  discardChallengeDraft,
  setChallengeStatus,
};
