import nodemailer from "nodemailer";

/**
 * SMTP-настройки берём из .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"), SMTP_USER, SMTP_PASS
 *   MAIL_FROM       — адрес отправителя (по умолчанию SMTP_USER)
 *   MAIL_TO         — получатели через запятую
 */

const requiredEnv = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(
    `[Mailer] Отсутствуют переменные окружения: ${missing.join(", ")}. Отправка писем работать не будет.`,
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Возвращает список получателей из MAIL_TO (через запятую).
 * @returns {string[]}
 */
export function getRecipients() {
  return (process.env.MAIL_TO || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

/**
 * Отправляет письмо. HTML-тело используется как есть.
 * @param {{ to: string | string[], subject: string, html: string }} options
 * @returns {Promise<boolean>} true при успешной отправке
 */
export async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error(
      `[Mailer Ошибка] Не удалось отправить письмо на ${to}:`,
      error.message,
    );
    return false;
  }
}
