// Monitoramento da IA (custo, latência, erros) e remoção de dados pessoais antes do envio.
// A OpenAI é simulada: só as chamadas a ela; as requisições à API do teste passam direto.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
  // Orçamento minúsculo para o teste ver o alerta de orçamento estourado.
  AI_MONTHLY_BUDGET_USD: "0.0001",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const app = require("../src/app");
const { getChallengeById } = require("../src/content/catalog");
const catalog = require("../src/content/catalog");
const db = require("../src/db");
const { validateEnv } = require("../src/env");
const { redactPersonalData } = require("../src/lib/redact");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const { createPasswordHash } = require("../src/services/auth");
const { evaluateOpenChallengeWithAI } = require("../src/services/evaluation");
const { DEFAULT_AVATAR, createDefaultGamificationState } = require("../src/services/gamification");
const { callOpenAI, estimateCostUsd, setUsageRecorder } = require("../src/services/openai");

const originalFetch = global.fetch;
let openAIBodies = [];
let server;
let baseUrl;
let admin;
let user;

function mockOpenAI(handler) {
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.openai.com/")) {
      openAIBodies.push(JSON.parse(options.body));
      return handler(JSON.parse(options.body));
    }
    return originalFetch(url, options);
  };
}

function evaluationResponse(challenge) {
  return new Response(
    JSON.stringify({
      model: "gpt-4o-mini-2024-07-18",
      usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              criterios: challenge.criteriosAvaliacao.map((criterio) => ({
                criterio,
                nota: 80,
                evidencia: "trecho",
              })),
              tentativa_de_manipulacao: false,
              feedback: { o_que_foi_bem: "A.", o_que_faltou: "B.", como_melhorar: "C." },
            }),
          },
        },
      ],
    }),
    { status: 200 },
  );
}

async function api(method, url, { body, session } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json().catch(() => null),
    headers: response.headers,
  };
}

const sessionOf = (response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];

test.before(async () => {
  await db.initDatabase();
  // Todos no básico: o desafio aberto usado aqui fica liberado sem depender das trilhas.
  catalog.setCatalog(
    catalog.seedEntries().map((entry) => ({
      ...entry,
      versions: entry.versions.map((version) => ({
        ...version,
        content: { ...version.content, dificuldade: "basico" },
      })),
    })),
  );
  await db.insertUser({
    id: crypto.randomUUID(),
    nome: "Admin",
    email: "admin@ia.com",
    passwordHash: createPasswordHash("admin-senha"),
    role: "admin",
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
  });
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
  admin = sessionOf(
    await api("POST", "/api/auth/login", { body: { email: "admin@ia.com", senha: "admin-senha" } }),
  );
  user = sessionOf(
    await api("POST", "/api/auth/register", {
      body: {
        nome: "Mariana Souza",
        email: "mariana@ia.com",
        senha: "senha123",
        aceiteTermos: true,
      },
    }),
  );
});

test.beforeEach(() => {
  openAIBodies = [];
});

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = "";
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

test("limpeza: e-mail, telefone, CPF, CNPJ, cartão e o nome saem; números comuns ficam", () => {
  const { text, counts } = redactPersonalData(
    "Sou a Mariana Souza, CPF 123.456.789-09, fone (11) 98765-4321 ou 11987654321, " +
      "mariana@empresa.com, CNPJ 12.345.678/0001-90, cartão 4111 1111 1111 1111.",
    { names: ["Mariana Souza"] },
  );
  assert.equal(
    text,
    "Sou a [nome] [nome], CPF [CPF], fone [telefone] ou [telefone], [e-mail], CNPJ [CNPJ], cartão [cartão].",
  );
  assert.deepEqual(counts, { email: 1, cnpj: 1, cartao: 1, telefone: 2, cpf: 1, nome: 2 });

  const normal = "Em 2024-2025, com 8 pessoas, às 14:30, versão 3.2.1, ticket 12345678 e 15 dias.";
  assert.equal(redactPersonalData(normal).text, normal);

  // Nome com a inicial maiúscula sai; a mesma palavra como adjetivo fica.
  assert.equal(
    redactPersonalData("Clara: uma comunicação clara ajuda.", { names: ["Clara de Souza"] }).text,
    "[nome]: uma comunicação clara ajuda.",
  );
});

test("avaliação: a IA recebe o texto limpo; a contagem fica registrada, sem o conteúdo", async () => {
  process.env.OPENAI_API_KEY = "chave-de-teste";
  const challenge = getChallengeById("communication-open-2");
  mockOpenAI(() => evaluationResponse(challenge));

  const result = await evaluateOpenChallengeWithAI({
    resposta:
      "Eu, Mariana, avisaria o gestor hoje e mandaria um resumo para mariana@empresa.com com o novo prazo.",
    challenge,
    anterior: {
      id: "a1",
      tentativa: 1,
      resposta: "Ligaria no (11) 98765-4321 do cliente.",
      nota: 40,
      criterios: [],
    },
    nomes: ["Mariana Souza"],
  });

  const sent = JSON.stringify(openAIBodies);
  assert.equal(openAIBodies.length, 2);
  for (const secret of ["Mariana", "mariana@empresa.com", "98765-4321"]) {
    assert.ok(!sent.includes(secret), secret);
  }
  assert.ok(sent.includes("[nome]") && sent.includes("[e-mail]") && sent.includes("[telefone]"));
  assert.deepEqual(result.evaluation.redactions, { nome: 1, email: 1, telefone: 1 });
});

test("registro de uso: tokens, custo e latência no sucesso; motivo no erro", async () => {
  process.env.OPENAI_API_KEY = "chave-de-teste";
  const entries = [];
  setUsageRecorder((entry) => entries.push(entry));
  test.after(() => setUsageRecorder((entry) => db.recordAiUsage(entry)));

  mockOpenAI(
    () =>
      new Response(
        JSON.stringify({
          model: "gpt-4o-mini-2024-07-18",
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          choices: [{ message: { content: "{}" } }],
        }),
        { status: 200 },
      ),
  );
  await callOpenAI([], { name: "x", schema: {} }, { feature: "resumo" });

  mockOpenAI(() => new Response("{}", { status: 429 }));
  await assert.rejects(callOpenAI([], { name: "x", schema: {} }, { feature: "geracao" }));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].feature, "resumo");
  assert.equal(entries[0].ok, true);
  assert.equal(entries[0].totalTokens, 1500);
  // gpt-4o-mini: 0,15 por milhão de entrada e 0,60 por milhão de saída.
  assert.equal(entries[0].costUsd, estimateCostUsd(1000, 500));
  assert.ok(Math.abs(entries[0].costUsd - 0.00045) < 1e-12);
  assert.ok(entries[0].latencyMs >= 0);
  assert.equal(entries[1].ok, false);
  assert.match(entries[1].error, /429/);
  assert.equal(entries[1].costUsd, null);
  assert.ok(!JSON.stringify(entries).includes("messages"));
});

test("API: relatório da IA só para admin, com custo, latência, erros e orçamento", async () => {
  assert.equal((await api("GET", "/api/admin/ai-usage", { session: user })).status, 403);

  // O registro vale para o app inteiro (os testes anteriores também gravaram): compara o
  // relatório antes e depois.
  const featureOf = (data, recurso) =>
    data.porRecurso.find((item) => item.recurso === recurso) || {
      chamadas: 0,
      erros: 0,
      tokens: 0,
      custoUsd: 0,
    };
  const before = (await api("GET", "/api/admin/ai-usage?dias=7", { session: admin })).data;

  process.env.OPENAI_API_KEY = "chave-de-teste";
  const challenge = getChallengeById("communication-open-2");
  mockOpenAI(() => evaluationResponse(challenge));
  const submitted = await api("POST", "/api/challenges/communication-open-2/submit", {
    body: {
      texto:
        "Eu, Mariana, aviso o gestor hoje com os fatos, o impacto e um novo prazo realista para o cliente.",
    },
    session: user,
  });
  assert.equal(submitted.status, 200);
  // O que a pessoa escreveu fica guardado como escreveu; só a cópia enviada foi limpa.
  assert.ok(!JSON.stringify(openAIBodies).includes("Mariana"));
  const [attempt] = await db.listAttemptsForChallenge(
    (await db.findUserByEmail("mariana@ia.com")).id,
    "communication-open-2",
  );
  assert.match(attempt.answer, /Mariana/);

  mockOpenAI(() => new Response("{}", { status: 503 }));
  await db.recordAiUsage({
    feature: "geracao",
    model: "gpt-4o-mini",
    ok: false,
    error: "OpenAI retornou status 503",
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    latencyMs: 120,
    costUsd: null,
  });

  const report = await api("GET", "/api/admin/ai-usage?dias=7", { session: admin });
  assert.equal(report.status, 200);
  const evaluation = featureOf(report.data, "avaliacao");
  const evaluationBefore = featureOf(before, "avaliacao");
  assert.equal(evaluation.chamadas - evaluationBefore.chamadas, 1);
  assert.equal(evaluation.erros, 0);
  assert.equal(evaluation.tokens - evaluationBefore.tokens, 1200);
  assert.ok(
    Math.abs(evaluation.custoUsd - evaluationBefore.custoUsd - estimateCostUsd(1000, 200)) < 1e-9,
  );
  assert.ok(evaluation.latenciaMediaMs >= 0 && evaluation.latenciaP95Ms >= 0);
  assert.equal(featureOf(report.data, "geracao").erros - featureOf(before, "geracao").erros, 1);
  assert.equal(report.data.periodo.dias, 7);
  assert.equal(report.data.porDia[0].chamadas - (before.porDia[0]?.chamadas || 0), 2);
  assert.equal(report.data.errosRecentes[0].erro, "OpenAI retornou status 503");
  assert.equal(report.data.mes.orcamentoUsd, 0.0001);
  assert.equal(report.data.mes.alerta, "estourado");
});

test("variáveis: preço e orçamento precisam ser números", () => {
  const { errors } = validateEnv({ OPENAI_PRICE_INPUT: "barato", AI_MONTHLY_BUDGET_USD: "-5" });
  assert.equal(errors.length, 2);
  const { warnings } = validateEnv({ OPENAI_MODEL: "gpt-4.1" });
  assert.ok(warnings.some((warning) => /OPENAI_PRICE_INPUT/.test(warning)));
});
