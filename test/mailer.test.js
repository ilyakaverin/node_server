import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildTransportOptions, checkMailerConfig, getRecipients } from "../utils/mailer.js";

const ENV_KEYS = ["MAIL_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

// Подменяет переменные окружения на время теста и восстанавливает их после.
function withEnv(t, values) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

describe("getRecipients", () => {
  test("разбирает MAIL_TO через запятую, убирая пробелы и пустые элементы", (t) => {
    withEnv(t, { MAIL_TO: " a@example.com, b@example.com,, ,c@example.com " });

    assert.deepEqual(getRecipients(), ["a@example.com", "b@example.com", "c@example.com"]);
  });

  test("без MAIL_TO получателей нет", (t) => {
    withEnv(t, {});

    assert.deepEqual(getRecipients(), []);
  });
});

describe("checkMailerConfig", () => {
  test("предупреждает о незаданных SMTP-переменных", (t) => {
    withEnv(t, { SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" });
    const warn = t.mock.method(console, "warn", () => {});

    assert.deepEqual(checkMailerConfig(), ["SMTP_USER", "SMTP_PASS"]);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /SMTP_USER, SMTP_PASS/);
  });

  test("молчит, если всё задано", (t) => {
    withEnv(t, {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    });
    const warn = t.mock.method(console, "warn", () => {});

    assert.deepEqual(checkMailerConfig(), []);
    assert.equal(warn.mock.callCount(), 0);
  });
});

describe("buildTransportOptions", () => {
  test("задаёт таймауты SMTP короче стандартных (2 и 10 минут)", () => {
    const options = buildTransportOptions({});

    assert.equal(options.connectionTimeout, 30_000);
    assert.equal(options.greetingTimeout, 30_000);
    assert.equal(options.socketTimeout, 60_000);
  });

  test("берёт параметры подключения из окружения", () => {
    const options = buildTransportOptions({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    });

    assert.equal(options.host, "smtp.example.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.deepEqual(options.auth, { user: "user", pass: "pass" });
  });

  test("по умолчанию порт 587 без TLS", () => {
    const options = buildTransportOptions({ SMTP_PORT: "не число" });

    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
  });
});
