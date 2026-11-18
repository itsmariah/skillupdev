// Operação: logs estruturados, id por requisição, erros em JSON, alertas por webhook e health.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const db = require("../src/db");
const { validateEnv } = require("../src/env");
const { logger, configureLogger } = require("../src/lib/logger");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const { MAX_ALERTS_PER_HOUR, sendAlert, resetAlerts } = require("../src/services/alerts");

const originalFetch = global.fetch;
const WEBHOOK = "https://hooks.example.com/alerta";
let webhookBodies = [];
let server;
let baseUrl;
let session;

// Só o webhook é simulado; as requisições à API do teste passam direto.
function mockWebhook(status = 204) {
  global.fetch = async (url, options) => {
    if (String(url) === WEBHOOK) {
      webhookBodies.push(JSON.parse(options.body));
      return new Response(null, { status });
    }
    return originalFetch(url, options);
  };
}

// Captura o que o logger escreve no console durante fn.
async function captureLogs(fn) {
  const lines = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  for (const method of Object.keys(originals)) {
    console[method] = (line) => lines.push(String(line));
  }
  try {
    await fn();
  } finally {
    Object.assign(console, originals);
  }
  return lines;
}

test.before(async () => {
  await db.initDatabase();
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
  const response = await originalFetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: "Logs",
      email: "logs@teste.com",
      senha: "senha123",
      aceiteTermos: true,
    }),
  });
  session = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0];
});

test.beforeEach(() => {
  webhookBodies = [];
  resetAlerts();
});

test.afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.ALERT_WEBHOOK_URL;
  configureLogger(process.env);
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

test("logger JSON: uma linha por evento, campos sensíveis mascarados e erro com pilha", async () => {
  configureLogger({ LOG_FORMAT: "json", LOG_LEVEL: "info" });
  const lines = await captureLogs(() => {
    logger.debug("não aparece");
    logger.info("Requisição", {
      requestId: "abc",
      senha: "123456",
      headers: { cookie: "sid=1", authorization: "Bearer x" },
    });
    logger.error("Falhou", { err: new Error("quebrou") });
  });

  assert.equal(lines.length, 2);
  const info = JSON.parse(lines[0]);
  assert.equal(info.level, "info");
  assert.equal(info.msg, "Requisição");
  assert.equal(info.requestId, "abc");
  assert.equal(info.senha, "[oculto]");
  assert.deepEqual(info.headers, { cookie: "[oculto]", authorization: "[oculto]" });
  assert.ok(info.time);
  const error = JSON.parse(lines[1]);
  assert.equal(error.err.message, "quebrou");
  assert.match(error.err.stack, /quebrou/);
});

test("logger legível no desenvolvimento e nível silent", async () => {
  configureLogger({ LOG_FORMAT: "pretty", LOG_LEVEL: "info" });
  const pretty = await captureLogs(() => logger.warn("Atenção", { port: 3000 }));
  assert.deepEqual(pretty, ['[warn] Atenção {"port":3000}']);

  configureLogger({ LOG_LEVEL: "silent" });
  assert.deepEqual(await captureLogs(() => logger.error("nada")), []);
});

test("alertas: sem URL nada sai; com URL, uma vez por tipo no intervalo e teto por hora", async () => {
  mockWebhook();
  assert.equal(await sendAlert({ key: "a", title: "teste" }), false);

  process.env.ALERT_WEBHOOK_URL = WEBHOOK;
  const now = Date.now();
  assert.equal(await sendAlert({ key: "a", title: "teste", error: new Error("x") }, { now }), true);
  assert.equal(await sendAlert({ key: "a", title: "teste" }, { now: now + 1000 }), false);
  assert.equal(await sendAlert({ key: "a", title: "teste" }, { now: now + 11 * 60 * 1000 }), true);
  assert.equal(webhookBodies.length, 2);
  // Discord lê "content"; Slack lê "text".
  assert.equal(webhookBodies[0].content, webhookBodies[0].text);
  assert.match(webhookBodies[0].content, /teste[\s\S]*Erro: Error: x/);

  resetAlerts();
  for (let index = 0; index < MAX_ALERTS_PER_HOUR + 5; index += 1) {
    await sendAlert({ key: `k${index}`, title: "muitos" }, { now });
  }
  assert.equal(webhookBodies.length, 2 + MAX_ALERTS_PER_HOUR);
});

test("alerta que falha não lança", async () => {
  process.env.ALERT_WEBHOOK_URL = WEBHOOK;
  mockWebhook(500);
  await captureLogs(async () => {
    assert.equal(await sendAlert({ key: "b", title: "teste" }), false);
  });
});

test("toda resposta leva X-Request-Id; um id seguro vindo do proxy é mantido", async () => {
  const generated = await fetch(`${baseUrl}/api/config`);
  assert.match(generated.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);

  const kept = await fetch(`${baseUrl}/api/config`, {
    headers: { "X-Request-Id": "req-12345678" },
  });
  assert.equal(kept.headers.get("x-request-id"), "req-12345678");

  const replaced = await fetch(`${baseUrl}/api/config`, {
    headers: { "X-Request-Id": "<script>alert(1)</script>" },
  });
  assert.notEqual(replaced.headers.get("x-request-id"), "<script>alert(1)</script>");
});

test("log de acesso: rota com parâmetros, status, duração e usuário, sem query string", async () => {
  configureLogger({ LOG_FORMAT: "json", LOG_LEVEL: "info" });
  const lines = await captureLogs(async () => {
    await fetch(`${baseUrl}/api/challenges/nao-existe/submit?email=x@y.com`, {
      method: "POST",
      headers: { Cookie: session, "Content-Type": "application/json" },
      body: "{}",
    });
  });
  const entry = lines.map((line) => JSON.parse(line)).find((item) => item.msg === "Requisição");

  assert.equal(entry.route, "/api/challenges/:challengeId/submit");
  assert.equal(entry.status, 404);
  assert.equal(entry.level, "info");
  assert.ok(entry.userId);
  assert.ok(Number.isInteger(entry.durationMs));
  assert.ok(!lines.join("").includes("x@y.com"));
});

test("rota de API inexistente e JSON malformado respondem em JSON", async () => {
  const missing = await fetch(`${baseUrl}/api/nao-existe`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { message: "Rota não encontrada." });

  const malformed = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ quebrado",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { message: "Requisição inválida." });
});

test("erro inesperado: 500 em JSON com o código, log com a pilha e alerta", async (t) => {
  process.env.ALERT_WEBHOOK_URL = WEBHOOK;
  mockWebhook();
  configureLogger({ LOG_FORMAT: "json", LOG_LEVEL: "error" });
  t.mock.method(db, "listAttemptsByUser", async () => {
    throw new Error("banco caiu");
  });

  let response;
  const lines = await captureLogs(async () => {
    response = await fetch(`${baseUrl}/api/trails`, { headers: { Cookie: session } });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.requestId, response.headers.get("x-request-id"));
  assert.match(body.message, new RegExp(body.requestId));
  assert.ok(!JSON.stringify(body).includes("banco caiu"));

  const logged = JSON.parse(lines.find((line) => line.includes("Erro não tratado")));
  assert.equal(logged.route, "/api/trails");
  assert.equal(logged.requestId, body.requestId);
  assert.match(logged.err.stack, /banco caiu/);

  assert.equal(webhookBodies.length, 1);
  assert.match(webhookBodies[0].text, /GET \/api\/trails/);
  assert.ok(webhookBodies[0].text.includes(body.requestId));
});

test("health confere o banco", async (t) => {
  const ok = await fetch(`${baseUrl}/api/health`);
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ok");

  const client = db.getClient();
  t.mock.method(client, "query", async () => {
    throw new Error("sem conexão");
  });
  const degraded = await fetch(`${baseUrl}/api/health`);
  assert.equal(degraded.status, 503);
  assert.equal((await degraded.json()).database, "erro");
});

test("variáveis de log e alerta são validadas", () => {
  const { errors } = validateEnv({
    LOG_LEVEL: "verbose",
    LOG_FORMAT: "xml",
    ALERT_WEBHOOK_URL: "http://inseguro.com/hook",
  });
  assert.equal(errors.length, 3);
  const { warnings } = validateEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://x/y" });
  assert.ok(warnings.some((warning) => /ALERT_WEBHOOK_URL/.test(warning)));
});
