import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processResource } from "../commands/process-resource.js";
import { createDb } from "../utils/db.js";

const resource = {
  id: "bank_deposits",
  description: "Размещение средств ЕКС",
  url: "https://roskazna.gov.ru/deposits",
  selectors: { title: ".title", files: ".file", date: ".date" },
};

const scraped = {
  title: "Информация о проведении операции",
  date: "03.07.2026",
  fileUrls: ["https://roskazna.gov.ru/storage/a.docx", "https://roskazna.gov.ru/storage/a.xml"],
};

/**
 * Настоящая база во временном каталоге, подменённые парсер и почта.
 * failFor — адреса, на которые отправка «не удаётся».
 */
function setup(t, { page = scraped, recipients = ["a@example.com", "b@example.com"], failFor = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kazna-process-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const db = createDb(path.join(dir, "database.json"));
  const sent = [];
  const scrapeCalls = [];
  const deps = {
    db,
    scrapeWebsite: async (url, selectors) => {
      scrapeCalls.push({ url, selectors });
      return page;
    },
    getRecipients: () => recipients,
    sendMail: async (mail) => {
      sent.push(mail);
      return !failFor.includes(mail.to);
    },
  };
  const run = () => processResource(resource, deps);

  return { db, sent, scrapeCalls, run };
}

describe("processResource", () => {
  beforeEach((t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "error", () => {});
  });

  test("парсит страницу ресурса по его URL и селекторам", async (t) => {
    const { scrapeCalls, run } = setup(t);

    await run();

    assert.deepEqual(scrapeCalls, [{ url: resource.url, selectors: resource.selectors }]);
  });

  test("при новых файлах отправляет каждому получателю отдельное письмо и сохраняет файлы", async (t) => {
    const { db, sent, run } = setup(t);

    await run();

    assert.deepEqual(
      sent.map((mail) => mail.to),
      ["a@example.com", "b@example.com"],
    );
    for (const mail of sent) {
      assert.equal(mail.subject, `Новое обновление: ${scraped.title}`);
      assert.ok(mail.html.includes("a.docx"));
    }
    assert.equal(db.hasNewFiles(resource.id, scraped.fileUrls), false);
  });

  test("повторный запуск с теми же файлами писем не отправляет", async (t) => {
    const { sent, run } = setup(t);

    await run();
    await run();

    assert.equal(sent.length, 2);
  });

  test("если страницу не удалось разобрать, ничего не отправляет и не сохраняет", async (t) => {
    const { db, sent, run } = setup(t, { page: null });

    await run();

    assert.equal(sent.length, 0);
    assert.equal(db.hasNewFiles(resource.id, scraped.fileUrls), true);
  });

  test("если не доставлено ни одно письмо, не сохраняет файлы и повторяет рассылку при следующем запуске", async (t) => {
    const { db, sent, run } = setup(t, { failFor: ["a@example.com", "b@example.com"] });

    await run();
    assert.equal(db.hasNewFiles(resource.id, scraped.fileUrls), true);

    await run();
    assert.equal(sent.length, 4);
  });

  // Текущий компромисс: адресат, на котором отправка упала, это обновление уже не получит.
  test("при частичной доставке помечает файлы как обработанные", async (t) => {
    const { db, sent, run } = setup(t, { failFor: ["b@example.com"] });

    await run();
    await run();

    assert.equal(sent.length, 2);
    assert.equal(db.hasNewFiles(resource.id, scraped.fileUrls), false);
  });

  test("без получателей сохраняет файлы, ничего не отправляя", async (t) => {
    const { db, sent, run } = setup(t, { recipients: [] });

    await run();

    assert.equal(sent.length, 0);
    assert.equal(db.hasNewFiles(resource.id, scraped.fileUrls), false);
  });
});
