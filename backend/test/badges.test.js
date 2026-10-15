// Badges configuráveis: tipos de regra (unidade), validação do painel e o fluxo pela API.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "",
  PGLITE_DATA_DIR: "memory://",
  OPENAI_API_KEY: "",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const app = require("../src/app");
const db = require("../src/db");
const badgeCatalog = require("../src/content/badgeCatalog");
const { SEED_BADGES } = require("../src/content/badges");
const { evaluateRule, validateRule } = require("../src/content/badgeRules");
const { SESSION_COOKIE } = require("../src/middleware/auth");
const { createPasswordHash } = require("../src/services/auth");
const {
  DEFAULT_AVATAR,
  createDefaultGamificationState,
  syncBadges,
  buildBadgeCatalog,
} = require("../src/services/gamification");
const { hydrateUser } = require("../src/services/users");

// Catálogo semente: Comunicação tem 3 básicos (closed-1..3), 2 intermediários (open-1, open-3)
// e 1 avançado (open-2).
const done = (challengeId, category = "Comunicação", wasIdeal = false) => ({
  userId: "user-1",
  challengeId,
  category,
  wasIdeal,
});
const context = (attempts, extra = {}) => ({ attempts, level: 1, gamification: {}, ...extra });
const BASICS = ["communication-closed-1", "communication-closed-2", "communication-closed-3"];

test("regra: desafios concluídos, com filtro de competência e de nível", () => {
  const rule = { tipo: "desafios_concluidos", quantidade: 2, competencia: "Comunicação" };
  assert.equal(evaluateRule(rule, context([done(BASICS[0])])), false);
  assert.equal(evaluateRule(rule, context([done(BASICS[0]), done(BASICS[1])])), true);
  assert.equal(
    evaluateRule(rule, context([done(BASICS[0]), done("teamwork-closed-1", "Trabalho em Equipe")])),
    false,
  );

  const advanced = { tipo: "desafios_concluidos", quantidade: 1, dificuldade: "avancado" };
  assert.equal(evaluateRule(advanced, context(BASICS.map((id) => done(id)))), false);
  assert.equal(evaluateRule(advanced, context([done("communication-open-2")])), true);
});

test("regra: nível da trilha concluído exige todos os desafios daquele nível", () => {
  const rule = {
    tipo: "nivel_trilha_concluido",
    competencia: "Comunicação",
    dificuldade: "basico",
  };
  assert.equal(evaluateRule(rule, context(BASICS.slice(0, 2).map((id) => done(id)))), false);
  assert.equal(evaluateRule(rule, context(BASICS.map((id) => done(id)))), true);

  // Nível sem desafios publicados nunca é "concluído".
  const empty = { tipo: "nivel_trilha_concluido", competencia: "Liderança", dificuldade: "basico" };
  assert.equal(evaluateRule(empty, context([])), false);
});

test("regra: ideais, competências, nível de XP e sequência", () => {
  const ideal = { tipo: "respostas_ideais", quantidade: 1, competencia: "Comunicação" };
  assert.equal(evaluateRule(ideal, context([done(BASICS[0])])), false);
  assert.equal(evaluateRule(ideal, context([done(BASICS[0], "Comunicação", true)])), true);

  const explored = { tipo: "competencias_exploradas", quantidade: 2 };
  assert.equal(
    evaluateRule(
      explored,
      context([done(BASICS[0]), done("teamwork-closed-1", "Trabalho em Equipe")]),
    ),
    true,
  );

  assert.equal(evaluateRule({ tipo: "nivel_xp", nivel: 3 }, context([], { level: 3 })), true);
  assert.equal(evaluateRule({ tipo: "nivel_xp", nivel: 3 }, context([], { level: 2 })), false);

  const streak = { tipo: "sequencia_perfeita", quantidade: 5 };
  assert.equal(evaluateRule(streak, context([], { gamification: { perfectStreak: 5 } })), true);

  assert.equal(evaluateRule({ tipo: "inexistente" }, context([])), false);
});

test("validação: só tipos conhecidos e só os parâmetros do tipo, nos formatos certos", () => {
  assert.deepEqual(validateRule({ tipo: "rm -rf" }).errors, [
    "Regra: escolha um dos tipos disponíveis.",
  ]);

  const extra = validateRule({ tipo: "nivel_xp", nivel: "3", predicate: "() => true" });
  assert.deepEqual(extra, { errors: [], rule: { tipo: "nivel_xp", nivel: 3 } });

  assert.ok(validateRule({ tipo: "nivel_xp", nivel: 9 }).errors[0].includes("de 1 a 5"));
  assert.ok(validateRule({ tipo: "desafios_concluidos" }).errors[0].includes("obrigatório"));
  assert.ok(
    validateRule({ tipo: "competencia_completa", competencia: "Culinária" }).errors[0].includes(
      "competência",
    ),
  );
  assert.ok(
    validateRule(
      { tipo: "ideal_nos_desafios", desafios: ["nao-existe"] },
      new Set(["x"]),
    ).errors[0].includes("não existe"),
  );
});

test("badge desativada não é concedida, mas quem já ganhou continua vendo", () => {
  const original = badgeCatalog.getBadges();
  try {
    badgeCatalog.setBadges([
      {
        id: "ativa",
        name: "Ativa",
        description: "d",
        rarity: "comum",
        active: true,
        position: 1,
        rule: { tipo: "desafios_concluidos", quantidade: 1 },
      },
      {
        id: "inativa",
        name: "Inativa",
        description: "d",
        rarity: "raro",
        active: false,
        position: 2,
        rule: { tipo: "desafios_concluidos", quantidade: 1 },
      },
      {
        id: "antiga",
        name: "Antiga",
        description: "d",
        rarity: "raro",
        active: false,
        position: 3,
        rule: { tipo: "nivel_xp", nivel: 5 },
      },
    ]);

    const user = hydrateUser({ id: "user-1", nome: "Dev", email: "dev@teste.com" });
    user.badges = [{ id: "antiga", earnedAt: "2026-01-01T00:00:00.000Z" }];

    const unlocked = syncBadges(user, [done(BASICS[0])]);
    assert.deepEqual(
      unlocked.map((badge) => badge.id),
      ["ativa"],
    );

    const shown = buildBadgeCatalog(user, [done(BASICS[0])]);
    assert.deepEqual(
      shown.map((badge) => [badge.id, badge.unlocked]),
      [
        ["ativa", true],
        ["antiga", true],
      ],
    );
  } finally {
    badgeCatalog.setBadges(original);
  }
});

// --- API ---
let server;
let baseUrl;
let admin;
let user;

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

const register = async (email) =>
  sessionOf(
    await api("POST", "/api/auth/register", {
      body: { nome: "Pessoa", email, senha: "senha123", aceiteTermos: true },
    }),
  );

const badgeIdsOf = async (session) =>
  (await api("GET", "/api/me", { session })).data.user.badgeCatalog.map((badge) => badge.id);

test.before(async () => {
  await db.initDatabase();
  await db.insertUser({
    id: crypto.randomUUID(),
    nome: "Admin",
    email: "admin@badges.com",
    passwordHash: createPasswordHash("admin-senha"),
    role: "admin",
    avatarConfig: DEFAULT_AVATAR,
    gamification: createDefaultGamificationState(),
  });
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;

  admin = sessionOf(
    await api("POST", "/api/auth/login", {
      body: { email: "admin@badges.com", senha: "admin-senha" },
    }),
  );
  user = await register("pessoa@badges.com");
});

test.after(async () => {
  server.close();
  await db.closeClient();
});

let createdId;
const twoBasics = {
  name: "Dois Básicos",
  description: "Conclua 2 desafios básicos de Comunicação.",
  rarity: "comum",
  rule: {
    tipo: "desafios_concluidos",
    quantidade: 2,
    competencia: "Comunicação",
    dificuldade: "basico",
  },
};

test("API: a semente entra no banco e só o admin gerencia badges", async () => {
  const { status, data } = await api("GET", "/api/admin/badges", { session: admin });
  assert.equal(status, 200);
  assert.equal(data.badges.length, SEED_BADGES.length);
  assert.equal(data.badges.filter((badge) => badge.active).length, 12);
  assert.ok(data.regras.tipos.some((type) => type.tipo === "nivel_trilha_concluido"));
  assert.equal(data.desafios.length, 30);

  assert.equal((await api("GET", "/api/admin/badges", { session: user })).status, 403);
  assert.equal(
    (await api("POST", "/api/admin/badges", { session: user, body: twoBasics })).status,
    403,
  );

  // Pessoas não veem as sugestões desativadas.
  const shown = await badgeIdsOf(user);
  assert.equal(shown.length, 12);
  assert.ok(!shown.includes("clear-voice"));
});

test("API: badge inválida é recusada; válida nasce desativada", async () => {
  const bad = await api("POST", "/api/admin/badges", {
    session: admin,
    body: { ...twoBasics, rarity: "mitico", rule: { tipo: "qualquer" } },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.errors.length, 2);

  const created = await api("POST", "/api/admin/badges", { session: admin, body: twoBasics });
  assert.equal(created.status, 201);
  assert.equal(created.data.badge.active, false);
  assert.deepEqual(created.data.badge.rule, twoBasics.rule);
  createdId = created.data.badge.id;
  assert.match(createdId, /^badge-dois-basicos-/);
});

test("API: badge desativada não é concedida; ativada, é concedida a quem cumpre a regra", async () => {
  for (const id of BASICS.slice(0, 2)) {
    const { data } = await api("POST", `/api/challenges/${id}/submit`, {
      session: user,
      body: { respostaId: "a" },
    });
    assert.ok(!data.result.unlockedBadges.some((badge) => badge.id === createdId));
  }

  const activated = await api("POST", `/api/admin/badges/${createdId}/activate`, {
    session: admin,
  });
  assert.equal(activated.data.badge.active, true);

  const { data } = await api("POST", `/api/challenges/${BASICS[2]}/submit`, {
    session: user,
    body: { respostaId: "a" },
  });
  assert.ok(data.result.unlockedBadges.some((badge) => badge.id === createdId));

  const listed = (await api("GET", "/api/admin/badges", { session: admin })).data.badges;
  assert.equal(listed.find((badge) => badge.id === createdId).earnedCount, 1);
});

test("API: editar a regra; desativar mantém a badge de quem já ganhou", async () => {
  const edited = await api("PUT", `/api/admin/badges/${createdId}`, {
    session: admin,
    body: { ...twoBasics, name: "Três Básicos", rule: { ...twoBasics.rule, quantidade: 3 } },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.badge.name, "Três Básicos");
  assert.equal(edited.data.badge.rule.quantidade, 3);

  assert.equal(
    (await api("PUT", "/api/admin/badges/nao-existe", { session: admin, body: twoBasics })).status,
    404,
  );

  await api("POST", `/api/admin/badges/${createdId}/deactivate`, { session: admin });

  assert.ok((await badgeIdsOf(user)).includes(createdId));
  assert.ok(!(await badgeIdsOf(await register("outra@badges.com"))).includes(createdId));
});
