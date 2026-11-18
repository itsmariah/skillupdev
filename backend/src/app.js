const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { IS_PRODUCTION, PORT, FRONTEND_DIR, FRONTEND_URL, STUDY_ENABLED } = require("./config");
const { createSameOriginCheck } = require("./middleware/origin");
const { apiLimiter } = require("./middleware/rateLimits");
const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const coachRoutes = require("./routes/coach");
const challengeRoutes = require("./routes/challenges");
const studyRoutes = require("./routes/study");
const adminRoutes = require("./routes/admin");
const adminContentRoutes = require("./routes/adminContent");
const adminBadgeRoutes = require("./routes/adminBadges");
const adminAiRoutes = require("./routes/adminAi");
const { requestContext } = require("./middleware/requestContext");
const { apiNotFound, errorHandler } = require("./middleware/errorHandler");
const db = require("./db");
const { setUsageRecorder } = require("./services/openai");

const HEALTH_DB_TIMEOUT_MS = 3000;

// Toda chamada à OpenAI feita pelo app fica registrada para o monitoramento (aba IA do painel).
setUsageRecorder((entry) => db.recordAiUsage(entry));

const app = express();
app.set("trust proxy", 1);
app.use(requestContext);

const allowedOrigins = FRONTEND_URL
  ? [FRONTEND_URL]
  : !IS_PRODUCTION
    ? [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]
    : [];

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);
app.use(express.json());
app.use(express.static(FRONTEND_DIR));
app.use("/api", apiLimiter, createSameOriginCheck(allowedOrigins));

// Para o health check do Render e monitores externos: confere também o banco.
app.get("/api/health", async (_req, res) => {
  let database = "ok";
  try {
    await Promise.race([
      db.getClient().query("SELECT 1"),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("timeout")), HEALTH_DB_TIMEOUT_MS).unref();
      }),
    ]);
  } catch (_error) {
    database = "erro";
  }

  res.status(database === "ok" ? 200 : 503).json({
    status: database === "ok" ? "ok" : "degradado",
    service: "skillupdev-backend",
    database,
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Configuração pública que o frontend precisa conhecer (nada sensível).
app.get("/api/config", (_req, res) => {
  res.json({ features: { study: STUDY_ENABLED } });
});

app.use(authRoutes);
app.use(meRoutes);
app.use(coachRoutes);
app.use(challengeRoutes);
app.use(studyRoutes);
app.use(adminRoutes);
app.use(adminContentRoutes);
app.use(adminBadgeRoutes);
app.use(adminAiRoutes);
app.use(apiNotFound);
app.use(errorHandler);

module.exports = app;
