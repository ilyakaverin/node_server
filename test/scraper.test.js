import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { scrapeWebsite } from "../utils/scraper.js";

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
};

let server;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    const body = routes[req.url];
    if (body === undefined) {
      res.writeHead(500).end("Internal Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
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
