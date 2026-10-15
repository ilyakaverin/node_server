import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { createHttpsAgent, loadCertificates, scrapeWebsite } from "../utils/scraper.js";

// Селекторы берём из настоящего конфига, чтобы тесты ломались вместе с ним.
const config = JSON.parse(
  fs.readFileSync(new URL("../configuration/resources.json", import.meta.url), "utf-8"),
);
const { selectors } = config.resources[0];

// Синтетическая разметка по селекторам из конфига (не копия реальной страницы).
const page = ({ title = "", date = "", links = "" }) => `<!doctype html>
<html><body>
  <div class="raisin-funds"><div id="op-inform">${title}</div></div>
  <div class="info-archive-table-block__title">Дата операции</div>${date}
  ${links}
</body></html>`;

const routes = {
  "/deposits/ok": page({
    title: "<p>Информация о проведении операции</p>",
    date: "<p>03.07.2026</p>",
    links: `
      <a class="colleges__link" href="/storage/operation-day-files/20260703_1.docx">docx</a>
      <a class="colleges__link" href="https://roskazna.gov.ru/storage/operation-day-files/20260703_1.xml">xml</a>
      <a class="colleges__link" href="files/relative.docx">относительная</a>
      <a class="colleges__link" href="/storage/operation-day-files/20260703_1.docx">дубль</a>
      <a class="colleges__link">без href</a>
      <a class="colleges__link" href="http://[">битая</a>
      <a class="other-link" href="/not-a-file.docx">чужая ссылка</a>`,
  }),
  "/deposits/no-title": page({
    links: `<a class="colleges__link" href="/a.docx">docx</a>`,
  }),
  "/deposits/no-files": page({ title: "<p>Заголовок</p>" }),
  "/deposits/multiline": page({
    title: "<p>\n  Информация о\n\t проведении  </p><p>операции</p>",
    date: "<p>\n 03.07.2026\n</p>",
    links: `<a class="colleges__link" href="/a.docx">docx</a>`,
  }),
  "/deposits/non-http": page({
    title: "<p>Заголовок</p>",
    links: `
      <a class="colleges__link" href="mailto:info@roskazna.ru">почта</a>
      <a class="colleges__link" href="javascript:alert(1)">скрипт</a>
      <a class="colleges__link" href="ftp://roskazna.gov.ru/a.docx">ftp</a>
      <a class="colleges__link" href="/a.docx">docx</a>`,
  }),
};

const fixture = (name) =>
  fs.readFileSync(new URL(`./fixtures/tls/${name}`, import.meta.url), "utf-8");

function handler(req, res) {
  const body = routes[req.url];
  if (body === undefined) {
    res.writeHead(500).end("Internal Server Error");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

let server;
let baseUrl;
// HTTPS-сервер с сертификатом, выпущенным тестовым CA (test/fixtures/tls).
let tlsServer;
let tlsUrl;

before(async () => {
  server = http.createServer(handler);
  baseUrl = `http://127.0.0.1:${await listen(server)}`;

  tlsServer = https.createServer({ key: fixture("server.key"), cert: fixture("server.pem") }, handler);
  tlsUrl = `https://127.0.0.1:${await listen(tlsServer)}`;
});

after(() => {
  for (const s of [server, tlsServer]) {
    s.closeAllConnections();
    s.close();
  }
});

describe("scrapeWebsite", () => {
  test("извлекает заголовок, дату и ссылки на файлы", async (t) => {
    t.mock.method(console, "warn", () => {});

    const result = await scrapeWebsite(`${baseUrl}/deposits/ok`, selectors);

    assert.deepEqual(result, {
      title: "Информация о проведении операции",
      date: "03.07.2026",
      fileUrls: [
        `${baseUrl}/storage/operation-day-files/20260703_1.docx`,
        "https://roskazna.gov.ru/storage/operation-day-files/20260703_1.xml",
        `${baseUrl}/deposits/files/relative.docx`,
      ],
    });
  });

  test("пропускает ссылки без href и с невалидным URL, предупреждая о них", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    await scrapeWebsite(`${baseUrl}/deposits/ok`, selectors);

    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /Некорректная ссылка "http:\/\/\["/);
  });

  test("склеивает несколько элементов через пробел и убирает лишние пробелы и переносы", async () => {
    const result = await scrapeWebsite(`${baseUrl}/deposits/multiline`, selectors);

    assert.equal(result.title, "Информация о проведении операции");
    assert.equal(result.date, "03.07.2026");
  });

  test("пропускает ссылки не на http(s), предупреждая о них", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    const result = await scrapeWebsite(`${baseUrl}/deposits/non-http`, selectors);

    assert.deepEqual(result.fileUrls, [`${baseUrl}/a.docx`]);
    assert.deepEqual(
      warn.mock.calls.map((call) => call.arguments[0].match(/"(.*)"/)[1]),
      ["mailto:info@roskazna.ru", "javascript:alert(1)", "ftp://roskazna.gov.ru/a.docx"],
    );
    assert.ok(warn.mock.calls.every((call) => /не на http\(s\)/.test(call.arguments[0])));
  });

  test("без селектора даты возвращает пустую дату", async (t) => {
    t.mock.method(console, "warn", () => {});
    const { date, ...withoutDate } = selectors;

    const result = await scrapeWebsite(`${baseUrl}/deposits/ok`, withoutDate);

    assert.equal(result.date, "");
  });

  test("возвращает null, если заголовок не найден", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    assert.equal(await scrapeWebsite(`${baseUrl}/deposits/no-title`, selectors), null);
    assert.match(warn.mock.calls[0].arguments[0], /Заголовок не найден/);
  });

  test("возвращает null, если файлы не найдены", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    assert.equal(await scrapeWebsite(`${baseUrl}/deposits/no-files`, selectors), null);
    assert.match(warn.mock.calls[0].arguments[0], /Файлы не найдены/);
  });

  test("возвращает null при HTTP-ошибке", async (t) => {
    const error = t.mock.method(console, "error", () => {});

    assert.equal(await scrapeWebsite(`${baseUrl}/missing`, selectors), null);
    assert.match(error.mock.calls[0].arguments[1], /status code 500/);
  });

  test("возвращает null, если сервер недоступен", async (t) => {
    const error = t.mock.method(console, "error", () => {});
    const closed = http.createServer();
    await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address();
    await new Promise((resolve) => closed.close(resolve));

    assert.equal(await scrapeWebsite(`http://127.0.0.1:${port}/`, selectors), null);
    assert.equal(error.mock.callCount(), 1);
  });
});

describe("проверка TLS", () => {
  test("не доверяет сертификату неизвестного CA (проверка не отключена)", async (t) => {
    const error = t.mock.method(console, "error", () => {});

    assert.equal(await scrapeWebsite(`${tlsUrl}/deposits/ok`, selectors), null);
    assert.equal(error.mock.callCount(), 1);
    assert.match(error.mock.calls[0].arguments[1], /проверьте каталог certs\//);
  });

  test("доверяет сайту, если его CA передан в createHttpsAgent", async (t) => {
    t.mock.method(console, "warn", () => {});
    const httpsAgent = createHttpsAgent([fixture("ca.pem")]);
    t.after(() => httpsAgent.destroy());

    const result = await scrapeWebsite(`${tlsUrl}/deposits/ok`, selectors, { httpsAgent });

    assert.equal(result?.title, "Информация о проведении операции");
  });

  test("createHttpsAgent без дополнительных сертификатов тоже не доверяет неизвестному CA", async (t) => {
    t.mock.method(console, "error", () => {});
    const httpsAgent = createHttpsAgent();
    t.after(() => httpsAgent.destroy());

    assert.equal(await scrapeWebsite(`${tlsUrl}/deposits/ok`, selectors, { httpsAgent }), null);
  });

  test("стандартные корневые сертификаты сохраняются наряду с дополнительными", () => {
    const extra = fixture("ca.pem");
    const { ca } = createHttpsAgent([extra]).options;

    assert.ok(ca.length > 100, "ожидались стандартные корневые сертификаты Node");
    assert.equal(ca.at(-1), extra);
  });
});

describe("loadCertificates", () => {
  test("читает *.pem и *.crt по алфавиту, остальные файлы пропускает", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kazna-certs-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, "b.crt"), "B");
    fs.writeFileSync(path.join(dir, "a.pem"), "A");
    fs.writeFileSync(path.join(dir, "README.md"), "readme");
    fs.writeFileSync(path.join(dir, "c.PEM"), "C");

    assert.deepEqual(loadCertificates(dir), ["A", "B", "C"]);
  });

  test("без каталога возвращает пустой список", () => {
    assert.deepEqual(loadCertificates(path.join(os.tmpdir(), "kazna-no-such-dir")), []);
  });
});
