const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { IS_PRODUCTION, PORT, FRONTEND_DIR, FRONTEND_URL } = require("./config");
const { createSameOriginCheck } = require("./middleware/origin");
const { apiLimiter } = require("./middleware/rateLimits");
const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const challengeRoutes = require("./routes/challenges");
const studyRoutes = require("./routes/study");
const adminRoutes = require("./routes/admin");

const app = express();
app.set("trust proxy", 1);

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

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "skillupdev-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use(authRoutes);
app.use(meRoutes);
app.use(challengeRoutes);
app.use(studyRoutes);
app.use(adminRoutes);

module.exports = app;
