// Importação do formato antigo (JSON único) para o PostgreSQL, usando PGlite em memória.
Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "", PGLITE_DATA_DIR: "memory://" });

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/db");
const { importLegacyDatabase } = require("../src/db/legacy");

const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const legacy = {
  users: [
    {
      id: "u1",
      nome: "Pessoa Um",
      email: "Um@Teste.com",
      passwordHash: "salt:hash",
      xp: 450,
      badges: [{ id: "first-mission", earnedAt: "2026-06-05T12:00:00.000Z" }],
      gamification: { perfectStreak: 2, dailyLoginStreak: 3, lastDailyLoginDate: "2026-06-10" },
      studyPreDone: true,
      studyVersion: 2,
      createdAt: "2026-06-01T10:00:00.000Z",
    },
    { id: "u2", nome: "Admin", email: "admin@teste.com", passwordHash: "salt:hash", isAdmin: true },
  ],
  sessions: [
    { tokenHash: "ativa", userId: "u1", createdAt: past, expiresAt: future },
    { tokenHash: "expirada", userId: "u1", createdAt: past, expiresAt: past },
    { tokenHash: "orfa", userId: "nao-existe", createdAt: past, expiresAt: future },
  ],
  challengeAttempts: [
    { id: "a1", userId: "u1", challengeId: "communication-closed-1", score: 100, xpAwarded: 100 },
    { id: "a2", userId: "u1", challengeId: "communication-closed-1", score: 100, xpAwarded: 100 },
    { id: "a3", userId: "u1", challengeId: "communication-open-1", score: 70, xpAwarded: 48 },
  ],
  passwordResetTokens: [{ id: "r1", userId: "u1", tokenHash: "x", expiresAt: future }],
  study_responses: [
    {
      id: "s1",
      userId: "u1",
      userName: "Pessoa Um",
      type: "pre",
      data: { curso: "CC" },
      submittedAt: past,
    },
  ],
};

test.before(() => db.initDatabase());
test.after(() => db.closeClient());

test("importa usuários, badges, sessões ativas, tentativas e respostas do estudo", async () => {
  const report = await importLegacyDatabase(legacy, db.getClient());

  assert.deepEqual(report, {
    users: 2,
    attempts: 2,
    duplicateAttempts: 1,
    sessions: 1,
    expiredSessions: 1,
    studyResponses: 1,
    duplicateStudyResponses: 0,
    orphans: 1,
  });

  const user = await db.findUserById("u1");
  assert.equal(user.email, "um@teste.com");
  assert.equal(user.xp, 450);
  assert.equal(user.nivel, 2);
  assert.equal(user.gamification.perfectStreak, 2);
  assert.equal(user.gamification.lastDailyLoginDate, "2026-06-10");
  assert.equal(user.studyVersion, 2);
  assert.deepEqual(user.badges, [{ id: "first-mission", earnedAt: "2026-06-05T12:00:00.000Z" }]);

  const attempts = await db.listAttemptsByUser("u1");
  assert.equal(attempts.length, 2);
  assert.equal(attempts.find((attempt) => attempt.id === "a1").qualityTier, "ideal");
  assert.equal(attempts.find((attempt) => attempt.id === "a3").category, "Comunicação");

  assert.deepEqual(await db.findActiveSession("ativa"), { tokenHash: "ativa", userId: "u1" });
  assert.equal(await db.findActiveSession("expirada"), null);
  assert.equal(await db.hasAdmin(), true);
  assert.equal(user.role, "user");
  assert.equal((await db.findUserById("u2")).role, "admin");
  assert.deepEqual((await db.findStudyResponse("u1", "pre")).data, { curso: "CC" });
});

test("não importa por cima de um banco que já tem usuários", async () => {
  await assert.rejects(() => importLegacyDatabase(legacy, db.getClient()), /já tem usuários/);
});
