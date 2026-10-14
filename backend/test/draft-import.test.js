// Importação de lotes de desafios como rascunho (scripts/import-challenge-drafts.js).
Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "", PGLITE_DATA_DIR: "memory://" });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const db = require("../src/db");
const catalog = require("../src/content/catalog");
const { importChallengeDrafts } = require("../src/db/draftImport");

const DRAFTS_DIR = path.join(__dirname, "..", "content-drafts");
const batches = fs
  .readdirSync(DRAFTS_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({
    file,
    data: JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, file), "utf8")),
  }));

test.before(() => db.initDatabase());
test.after(() => db.closeClient());

const countChallenges = async () =>
  (await db.getClient().query("SELECT COUNT(*)::int AS total FROM challenges")).rows[0].total;

test("todos os lotes em content-drafts são válidos e entram como rascunho invisível", async () => {
  assert.ok(batches.length > 0);

  for (const { file, data } of batches) {
    const report = await importChallengeDrafts(data, db.getClient());
    assert.equal(report.criados.length, data.desafios.length, file);
  }

  await db.reloadCatalog();
  const published = new Set(catalog.getChallenges().map((challenge) => challenge.titulo));
  for (const { data } of batches) {
    for (const item of data.desafios) {
      assert.equal(published.has(item.titulo), false, `${item.titulo} não deveria estar publicado`);
    }
  }
});

test("rodar o mesmo lote de novo não duplica", async () => {
  const before = await countChallenges();
  const report = await importChallengeDrafts(batches[0].data, db.getClient());

  assert.equal(report.criados.length, 0);
  assert.equal(report.pulados.length, batches[0].data.desafios.length);
  assert.equal(await countChallenges(), before);
});

test("lote com qualquer desafio inválido não grava nada", async () => {
  const before = await countChallenges();
  const batch = {
    lote: "teste",
    desafios: [
      { ...batches[0].data.desafios[0], titulo: "Válido, mas não deve entrar" },
      { tipo: "aberto", categoria: "Liderança", titulo: "Sem cenário nem habilidades" },
    ],
  };

  await assert.rejects(() => importChallengeDrafts(batch, db.getClient()), /Nada foi gravado/);
  assert.equal(await countChallenges(), before);
});
