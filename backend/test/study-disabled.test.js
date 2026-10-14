// Estudo piloto desligado (o padrão desde o fim do TCC): os questionários saem da jornada,
// mas os dados já coletados continuam no painel admin.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
  STUDY_ENABLED: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const db = require("../src/db");

let server;
let baseUrl;

test.before(async () => {
  await db.initDatabase();
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

test("configuração pública informa que o estudo está desligado", async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { features: { study: false } });
});

test("questionário responde 404 com o estudo desligado, antes mesmo de exigir login", async () => {
  const response = await fetch(`${baseUrl}/api/study/questionnaire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "pre", data: { curso: "CC" } }),
  });

  assert.equal(response.status, 404);
});
