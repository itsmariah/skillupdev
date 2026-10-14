// Validação das variáveis de ambiente (função pura, sem tocar em process.env).
const test = require("node:test");
const assert = require("node:assert/strict");

const { validateEnv, isProductionEnv } = require("../src/env");

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:senha@host.neon.tech/db?sslmode=require",
  APP_BASE_URL: "https://skillupdev.exemplo.com",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_teste",
  EMAIL_FROM: "SkillUp Dev <no-reply@exemplo.com>",
  OPENAI_API_KEY: "sk-teste",
  ADMIN_EMAIL: "admin@exemplo.com",
  ADMIN_PASSWORD: "uma-senha-bem-longa",
};

test("ambiente de produção completo não tem erros nem avisos", () => {
  assert.deepEqual(validateEnv(productionEnv), { errors: [], warnings: [] });
});

test("desenvolvimento sem nada definido sobe, só com avisos", () => {
  const { errors, warnings } = validateEnv({});
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes("APP_BASE_URL")));
  assert.ok(warnings.some((w) => w.includes("OPENAI_API_KEY")));
});

test("produção exige DATABASE_URL e APP_BASE_URL com https", () => {
  const missing = validateEnv({ ...productionEnv, DATABASE_URL: "", APP_BASE_URL: "" }).errors;
  assert.ok(missing.some((e) => e.includes("DATABASE_URL")));
  assert.ok(missing.some((e) => e.includes("APP_BASE_URL")));

  const http = validateEnv({ ...productionEnv, APP_BASE_URL: "http://skillupdev.exemplo.com" });
  assert.ok(http.errors.some((e) => e.includes("https")));
});

test("RENDER definido conta como produção", () => {
  assert.equal(isProductionEnv({ RENDER: "true" }), true);
  assert.equal(isProductionEnv({ NODE_ENV: "development" }), false);
  assert.ok(validateEnv({ RENDER: "true" }).errors.some((e) => e.includes("DATABASE_URL")));
});

test("valores mal formatados são recusados", () => {
  const { errors } = validateEnv({
    PORT: "abc",
    NODE_ENV: "prod",
    DATABASE_URL: "mysql://host/db",
    APP_BASE_URL: "skillupdev.com",
    FRONTEND_URL: "ftp://exemplo.com",
    EMAIL_PROVIDER: "sendgrid",
    ADMIN_EMAIL: "admin",
  });

  for (const name of [
    "PORT",
    "NODE_ENV",
    "DATABASE_URL",
    "APP_BASE_URL",
    "FRONTEND_URL",
    "EMAIL_PROVIDER",
    "ADMIN_EMAIL",
  ]) {
    assert.ok(
      errors.some((e) => e.startsWith(name)),
      `esperava erro para ${name}`,
    );
  }
});

test("e-mail configurado pela metade: erro em produção, aviso em desenvolvimento", () => {
  const partial = { ...productionEnv, EMAIL_FROM: "" };
  assert.ok(validateEnv(partial).errors.some((e) => e.includes("EMAIL_FROM")));

  const dev = validateEnv({ EMAIL_PROVIDER: "resend" });
  assert.deepEqual(dev.errors, []);
  assert.ok(dev.warnings.some((w) => w.includes("RESEND_API_KEY e EMAIL_FROM")));
});

test("avisos de produção: sem e-mail, preview de reset ligado e senha curta do admin", () => {
  const { warnings } = validateEnv({
    ...productionEnv,
    EMAIL_PROVIDER: "",
    RESEND_API_KEY: "",
    ALLOW_RESET_PREVIEW: "true",
    ADMIN_PASSWORD: "curta",
  });

  assert.ok(warnings.some((w) => w.includes("recuperação de senha")));
  assert.ok(warnings.some((w) => w.includes("ALLOW_RESET_PREVIEW")));
  assert.ok(warnings.some((w) => w.includes("ADMIN_PASSWORD")));
});
