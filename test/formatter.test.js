import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { formatUpdateEmail } from "../utils/formatter.js";

const resource = { id: "bank_deposits", description: "Размещение средств ЕКС" };

describe("formatUpdateEmail", () => {
  test("формирует тему и тело письма со ссылками на файлы", () => {
    const { subject, html } = formatUpdateEmail(resource, {
      title: "Информация о проведении операции",
      date: "03.07.2026",
      fileUrls: [
        "https://roskazna.gov.ru/storage/operation-day-files/20260703_1.docx",
        "https://roskazna.gov.ru/storage/operation-day-files/20260703_1.xml",
      ],
    });

    assert.equal(subject, "Новое обновление: Информация о проведении операции");
    assert.ok(html.includes("<b>Раздел:</b> Размещение средств ЕКС"));
    assert.ok(html.includes("<b>Блок:</b> Информация о проведении операции"));
    assert.ok(html.includes("<b>Дата:</b> 03.07.2026"));
    assert.ok(
      html.includes(
        '- <a href="https://roskazna.gov.ru/storage/operation-day-files/20260703_1.docx">20260703_1.docx</a>' +
          "<br>" +
          '- <a href="https://roskazna.gov.ru/storage/operation-day-files/20260703_1.xml">20260703_1.xml</a>',
      ),
    );
  });

  test("экранирует HTML в данных со страницы и в описании раздела", () => {
    const { html } = formatUpdateEmail(
      { description: "A & B" },
      {
        title: "<script>alert(1)</script>",
        date: "<b>сегодня</b>",
        fileUrls: ["https://example.com/a&b.docx"],
      },
    );

    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes("A &amp; B"));
    assert.ok(html.includes("&lt;b&gt;сегодня&lt;/b&gt;"));
    assert.ok(html.includes('href="https://example.com/a&amp;b.docx"'));
  });

  test("тема письма — обычный текст и не экранируется", () => {
    const { subject } = formatUpdateEmail(resource, {
      title: "Депозиты & вклады",
      date: "",
      fileUrls: [],
    });

    assert.equal(subject, "Новое обновление: Депозиты & вклады");
  });

  test("декодирует кириллические имена файлов из URL", () => {
    const { html } = formatUpdateEmail(resource, {
      title: "t",
      date: "d",
      fileUrls: ["https://roskazna.gov.ru/files/%D0%BE%D1%82%D1%87%D1%91%D1%82.docx"],
    });

    assert.ok(html.includes(">отчёт.docx</a>"));
  });

  test("подставляет «Файл N», если имя из URL получить нельзя", () => {
    const { html } = formatUpdateEmail(resource, {
      title: "t",
      date: "d",
      fileUrls: [
        "https://roskazna.gov.ru/storage/", // пустое имя
        "https://roskazna.gov.ru/%E0%A4%A.docx", // битый percent-encoding
        "не ссылка", // невалидный URL
      ],
    });

    assert.ok(html.includes('storage/">Файл 1</a>'));
    assert.ok(html.includes('.docx">Файл 2</a>'));
    assert.ok(html.includes('"не ссылка">Файл 3</a>'));
  });

  test("без файлов блок со ссылками пустой", () => {
    const { html } = formatUpdateEmail(resource, { title: "t", date: "d", fileUrls: [] });

    assert.ok(html.endsWith("<p></p>"));
    assert.ok(!html.includes("<a "));
  });
});
