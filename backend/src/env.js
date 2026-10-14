// Validação das variáveis de ambiente, feita uma vez na inicialização (server.js).
// Erros impedem o servidor de subir; avisos só aparecem no log.
// Função pura sobre o objeto de ambiente, para ser testável sem mexer em process.env.
const NODE_ENVS = ["development", "production", "test"];
const EMAIL_PROVIDERS = ["resend"];

const read = (env, name) => String(env[name] ?? "").trim();

function parseUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url : null;
  } catch (_error) {
    return null;
  }
}

function isProductionEnv(env) {
  return read(env, "NODE_ENV") === "production" || Boolean(read(env, "RENDER"));
}

function validateEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const production = isProductionEnv(env);

  const port = read(env, "PORT");
  if (port && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) <= 65535)) {
    errors.push(`PORT inválida ("${port}"): use um número entre 1 e 65535.`);
  }

  const nodeEnv = read(env, "NODE_ENV");
  if (nodeEnv && !NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV inválido ("${nodeEnv}"): use ${NODE_ENVS.join(", ")}.`);
  }

  // Banco
  const databaseUrl = read(env, "DATABASE_URL");
  if (databaseUrl && !parseUrl(databaseUrl, ["postgres:", "postgresql:"])) {
    errors.push("DATABASE_URL inválida: use uma connection string postgres:// ou postgresql://.");
  }
  if (!databaseUrl && production) {
    errors.push("DATABASE_URL não definida. Em produção o banco precisa ser PostgreSQL.");
  }

  // URLs públicas
  const appBaseUrl = read(env, "APP_BASE_URL");
  const parsedBaseUrl = appBaseUrl ? parseUrl(appBaseUrl, ["http:", "https:"]) : null;
  if (appBaseUrl && !parsedBaseUrl) {
    errors.push("APP_BASE_URL inválida: use uma URL completa, como https://seu-dominio.com.");
  }
  if (production) {
    if (!appBaseUrl) {
      errors.push(
        "APP_BASE_URL não definida. Em produção ela é usada nos links enviados por e-mail.",
      );
    } else if (parsedBaseUrl && parsedBaseUrl.protocol !== "https:") {
      errors.push("APP_BASE_URL precisa usar https em produção.");
    }
  } else if (!appBaseUrl) {
    warnings.push("APP_BASE_URL não definido. Links de e-mail apontarão para localhost.");
  }

  const frontendUrl = read(env, "FRONTEND_URL");
  if (frontendUrl && !parseUrl(frontendUrl, ["http:", "https:"])) {
    errors.push("FRONTEND_URL inválida: use uma URL completa, como https://seu-dominio.com.");
  }

  // E-mail (Resend)
  const emailProvider = read(env, "EMAIL_PROVIDER").toLowerCase();
  const resendKey = read(env, "RESEND_API_KEY");
  const emailFrom = read(env, "EMAIL_FROM");
  if (emailProvider && !EMAIL_PROVIDERS.includes(emailProvider)) {
    errors.push(`EMAIL_PROVIDER inválido ("${emailProvider}"): use ${EMAIL_PROVIDERS.join(", ")}.`);
  } else if (emailProvider || resendKey) {
    const missing = [!resendKey && "RESEND_API_KEY", !emailFrom && "EMAIL_FROM"].filter(Boolean);
    if (missing.length > 0) {
      const message = `E-mail configurado pela metade: falta ${missing.join(" e ")}.`;
      (production ? errors : warnings).push(message);
    }
  } else if (production) {
    warnings.push("Envio de e-mail não configurado: a recuperação de senha não enviará links.");
  }

  if (production && read(env, "ALLOW_RESET_PREVIEW") === "true") {
    warnings.push("ALLOW_RESET_PREVIEW=true é ignorado em produção. Remova a variável.");
  }

  const timeZone = read(env, "APP_TIMEZONE");
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone });
    } catch (_error) {
      errors.push(
        `APP_TIMEZONE inválido ("${timeZone}"): use um fuso IANA, como America/Sao_Paulo.`,
      );
    }
  }

  const studyEnabled = read(env, "STUDY_ENABLED");
  if (studyEnabled && !["true", "false"].includes(studyEnabled)) {
    errors.push(`STUDY_ENABLED inválido ("${studyEnabled}"): use true ou false.`);
  }

  // IA
  if (!read(env, "OPENAI_API_KEY")) {
    warnings.push("OPENAI_API_KEY não definida. Respostas abertas usarão a avaliação heurística.");
  }

  // Administrador
  const adminEmail = read(env, "ADMIN_EMAIL");
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    errors.push(`ADMIN_EMAIL inválido ("${adminEmail}").`);
  }
  const adminPassword = String(env.ADMIN_PASSWORD ?? "");
  if (adminPassword && adminPassword.length < 12) {
    warnings.push("ADMIN_PASSWORD tem menos de 12 caracteres. Use uma senha mais forte.");
  }

  return { errors, warnings };
}

module.exports = {
  isProductionEnv,
  validateEnv,
};
