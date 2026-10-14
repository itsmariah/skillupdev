const { IS_PRODUCTION, PORT, RESEND_API_URL, EMAIL_TIMEOUT_MS } = require("../config");
const { normalizeTextValue, normalizeEmail, escapeHtml } = require("../lib/text");

// O hostname da requisição é controlável pelo cliente (X-Forwarded-Host com trust proxy),
// então o preview depende só de configuração do servidor.
function shouldExposeResetPreview() {
  return !IS_PRODUCTION && process.env.ALLOW_RESET_PREVIEW === "true";
}

// Nunca deriva a URL do header Host, para evitar host header poisoning no link de reset.
function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || `http://localhost:${PORT}`)
    .trim()
    .replace(/\/+$/, "");
}

function buildPasswordResetUrl(req, rawToken) {
  return `${getAppBaseUrl()}/pages/reset_password.html?token=${encodeURIComponent(rawToken)}`;
}

function maskEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return normalizedEmail;
  }

  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - visibleLocal.length, 1))}@${domain}`;
}

function getEmailProvider() {
  const provider = normalizeTextValue(process.env.EMAIL_PROVIDER);

  if (provider) {
    return provider;
  }

  if (String(process.env.RESEND_API_KEY || "").trim()) {
    return "resend";
  }

  return "";
}

function getEmailFrom() {
  return String(process.env.EMAIL_FROM || "").trim();
}

function getEmailReplyTo() {
  return String(process.env.EMAIL_REPLY_TO || "").trim();
}

function isRealEmailConfigured() {
  return getEmailProvider() === "resend" && Boolean(process.env.RESEND_API_KEY && getEmailFrom());
}

function buildPasswordResetEmail({ user, req, rawToken, expiresAt }) {
  const resetUrl = buildPasswordResetUrl(req, rawToken);
  const safeName = escapeHtml(user.nome || "Dev");
  const expirationLabel = formatDisplayDate(expiresAt);
  const supportEmail = escapeHtml(getEmailReplyTo() || getEmailFrom());
  const safeResetUrl = escapeHtml(resetUrl);

  return {
    resetUrl,
    subject: "Redefina sua senha na SkillUp Dev",
    text: [
      `Olá, ${user.nome || "Dev"}!`,
      "",
      "Recebemos um pedido para redefinir sua senha na SkillUp Dev.",
      `Use este link: ${resetUrl}`,
      `Validade: ${expirationLabel}`,
      "",
      "Se você não solicitou a redefinição, ignore este email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f7ff;padding:32px;color:#2c2457;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 16px 40px rgba(44,36,87,0.12);">
          <p style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#5b6cff;font-weight:700;margin:0 0 12px;">
            Recuperação de senha
          </p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Oi, ${safeName}</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4b4f70;">
            Recebemos um pedido para redefinir sua senha na SkillUp Dev.
          </p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b4f70;">
            Clique no botão abaixo para criar uma nova senha. Esse link expira em <strong>${escapeHtml(
              expirationLabel,
            )}</strong>.
          </p>
          <p style="margin:0 0 28px;">
            <a href="${safeResetUrl}" style="display:inline-block;background:linear-gradient(135deg,#5b6cff,#7a88ff);color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700;">
              Redefinir senha
            </a>
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#6b6f8c;">
            Se o botão não abrir, copie e cole este link no navegador:
          </p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-word;">
            <a href="${safeResetUrl}" style="color:#5b6cff;">${safeResetUrl}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#7b809d;">
            Se você não solicitou essa troca, ignore este email. Em caso de dúvida, fale com ${supportEmail}.
          </p>
        </div>
      </div>
    `,
  };
}

function formatDisplayDate(dateValue) {
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "alguns minutos";
  }

  return parsedDate.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function sendEmailWithResend({ to, subject, html, text }) {
  const payload = {
    from: getEmailFrom(),
    to: [to],
    subject,
    html,
    text,
  };

  const replyTo = getEmailReplyTo();
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = data?.message || data?.error || `status ${response.status}`;
    throw new Error(`Resend não aceitou o envio (${reason}).`);
  }

  return data;
}

async function sendPasswordResetEmail({ user, req, rawToken, expiresAt }) {
  const provider = getEmailProvider();
  const emailContent = buildPasswordResetEmail({ user, req, rawToken, expiresAt });

  if (provider === "resend") {
    return sendEmailWithResend({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  throw new Error("Provedor de email não suportado para envio real.");
}

module.exports = {
  shouldExposeResetPreview,
  getAppBaseUrl,
  buildPasswordResetUrl,
  maskEmail,
  getEmailProvider,
  getEmailFrom,
  getEmailReplyTo,
  isRealEmailConfigured,
  buildPasswordResetEmail,
  formatDisplayDate,
  sendEmailWithResend,
  sendPasswordResetEmail,
};
