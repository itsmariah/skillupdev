const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");
// PostgreSQL (Neon em produção). Sem DATABASE_URL, o desenvolvimento local usa o PGlite,
// gravando em PGLITE_DATA_DIR ("memory://" mantém tudo só em memória, como nos testes).
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, "..", "data", "pglite");

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const RESEND_API_URL = process.env.RESEND_API_URL || "https://api.resend.com/emails";
const OPENAI_TIMEOUT_MS = 20 * 1000;
const EMAIL_TIMEOUT_MS = 10 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@skillupdev.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL;
const STUDY_MIN_CHALLENGES = 10;
const STUDY_VERSION = 2;
const MAX_NAME_LENGTH = 200;
const MIN_OPEN_ANSWER_LENGTH = 30;
const MAX_OPEN_ANSWER_LENGTH = 3000;

module.exports = {
  PORT,
  FRONTEND_DIR,
  DATABASE_URL,
  PGLITE_DATA_DIR,
  OPENAI_MODEL,
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_TTL_MS,
  SESSION_TTL_DAYS,
  SESSION_TTL_MS,
  RESEND_API_URL,
  OPENAI_TIMEOUT_MS,
  EMAIL_TIMEOUT_MS,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  FRONTEND_URL,
  STUDY_MIN_CHALLENGES,
  STUDY_VERSION,
  MAX_NAME_LENGTH,
  MIN_OPEN_ANSWER_LENGTH,
  MAX_OPEN_ANSWER_LENGTH,
};
