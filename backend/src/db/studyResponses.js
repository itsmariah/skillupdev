const { getClient } = require("./client");

const toIso = (value) => (value ? new Date(value).toISOString() : null);

function rowToStudyResponse(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    type: row.type,
    studyVersion: row.study_version,
    submittedAt: toIso(row.submitted_at),
    data: row.data,
  };
}

async function findStudyResponse(userId, type, db = getClient()) {
  const { rows } = await db.query(
    "SELECT * FROM study_responses WHERE user_id = $1 AND type = $2",
    [userId, type],
  );
  return rows[0] ? rowToStudyResponse(rows[0]) : null;
}

// Lança erro de violação única se o usuário já respondeu esse questionário.
async function insertStudyResponse(record, db = getClient()) {
  await db.query(
    `INSERT INTO study_responses (id, user_id, user_name, user_email, type, study_version, submitted_at, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.id,
      record.userId,
      record.userName ?? null,
      record.userEmail ?? null,
      record.type,
      record.studyVersion ?? null,
      record.submittedAt,
      JSON.stringify(record.data ?? {}),
    ],
  );
}

async function listStudyResponses(db = getClient()) {
  const { rows } = await db.query("SELECT * FROM study_responses ORDER BY submitted_at, id");
  return rows.map(rowToStudyResponse);
}

module.exports = {
  findStudyResponse,
  insertStudyResponse,
  listStudyResponses,
};
