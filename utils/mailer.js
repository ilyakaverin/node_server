import nodemailer from "nodemailer";

/**
 * SMTP-настройки берём из .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"), SMTP_USER, SMTP_PASS
 *   MAIL_FROM       — адрес отправителя (по умолчанию SMTP_USER)
 *   MAIL_TO         — получатели через запятую
 */

// SMTP_PORT необязателен: по умолчанию 587 (см. buildTransportOptions).
const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];

// По умолчанию nodemailer ждёт соединения до 2 минут, а при бездействии сокета —
// до 10 минут. Зависшая отправка на столько же задерживала бы следующие запуски.
const SMTP_TIMEOUTS = {
  connectionTimeout: 30_000,
  greetingTimeout: 30_000,
  socketTimeout: 60_000,
};

/**
 * Предупреждает о незаданных SMTP-переменных. Вызывается при старте приложения.
 * @returns {string[]} список отсутствующих переменных
 */
export function checkMailerConfig() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(
      `[Mailer] Отсутствуют переменные окружения: ${missing.join(", ")}. Отправка писем работать не будет.`,
    );
  }
  return missing;
}

/**
 * Настройки SMTP-транспорта nodemailer из переменных окружения.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildTransportOptions(env = process.env) {
  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === "true",
    family: 4,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    ...SMTP_TIMEOUTS,
  };
}

let transporter;

function getTransporter() {
  transporter ??= nodemailer.createTransport(buildTransportOptions());
  return transporter;
}

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
    await getTransporter().sendMail({
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
