const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");
const DEFAULT_DATA_FILE = path.join(__dirname, "..", "data", "db.json");
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : DEFAULT_DATA_FILE;
const DATA_DIR = path.dirname(DATA_FILE);
const REDIS_DB_KEY = process.env.REDIS_DB_KEY || "skillupdev:db";

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
  DEFAULT_DATA_FILE,
  DATA_FILE,
  DATA_DIR,
  REDIS_DB_KEY,
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
