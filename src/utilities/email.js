const nodemailer = require("nodemailer");

const parsePort = (value) => {
  const port = Number(value);
  return Number.isFinite(port) ? port : 587;
};

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.",
    );
  }

  const port = parsePort(process.env.SMTP_PORT);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

const buildResetEmailHtml = ({ name, resetUrl }) => {
  const safeName = String(name || "").trim() || "there";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
      <h2 style="margin: 0 0 12px;">Reset your BizFlow password</h2>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your password. Click the link below to set a new one:</p>
      <p style="margin: 16px 0;">
        <a href="${resetUrl}" style="color: #4f46e5; font-weight: 600;">Reset your password</a>
      </p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  `;
};

const buildResetEmailText = ({ name, resetUrl }) => {
  const safeName = String(name || "").trim() || "there";

  return [
    `Hi ${safeName},`,
    "",
    "We received a request to reset your BizFlow password.",
    "Use the link below to set a new password:",
    resetUrl,
    "",
    "If you did not request a reset, you can ignore this email.",
  ].join("\n");
};

exports.sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  if (!to || !resetUrl) {
    throw new Error("Missing email or reset URL.");
  }

  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || "BizFlow <no-reply@bizflow.local>";

  await transporter.sendMail({
    from,
    to,
    subject: "Reset your BizFlow password",
    text: buildResetEmailText({ name, resetUrl }),
    html: buildResetEmailHtml({ name, resetUrl }),
  });
};
