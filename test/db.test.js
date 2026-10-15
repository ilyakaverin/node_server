import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDb } from "../utils/db.js";

const A = "https://roskazna.gov.ru/storage/a.docx";
const B = "https://roskazna.gov.ru/storage/b.xml";
const C = "https://roskazna.gov.ru/storage/c.docx";

function tmpDbPath(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kazna-db-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "database.json");
}

describe("db", () => {
  test("без файла базы любые ссылки считаются новыми, а чтение файл не создаёт", (t) => {
    const dbPath = tmpDbPath(t);
    const db = createDb(dbPath);

    assert.equal(db.hasNewFiles("bank_deposits", [A]), true);
    assert.equal(fs.existsSync(dbPath), false);
  });

  test("пустой или отсутствующий список ссылок не считается обновлением", (t) => {
    const db = createDb(tmpDbPath(t));

    assert.equal(db.hasNewFiles("bank_deposits", []), false);
    assert.equal(db.hasNewFiles("bank_deposits", undefined), false);
  });

  test("после сохранения те же ссылки (в любом порядке) не считаются новыми", (t) => {
    const db = createDb(tmpDbPath(t));
    db.saveFiles("bank_deposits", [A, B]);

    assert.equal(db.hasNewFiles("bank_deposits", [A, B]), false);
    assert.equal(db.hasNewFiles("bank_deposits", [B, A]), false);
  });

  test("появление хотя бы одной новой ссылки считается обновлением", (t) => {
    const db = createDb(tmpDbPath(t));
    db.saveFiles("bank_deposits", [A, B]);

    assert.equal(db.hasNewFiles("bank_deposits", [A, B, C]), true);
    assert.equal(db.hasNewFiles("bank_deposits", [C]), true);
  });

  test("исчезновение ссылок со страницы обновлением не считается", (t) => {
    const db = createDb(tmpDbPath(t));
    db.saveFiles("bank_deposits", [A, B]);

    assert.equal(db.hasNewFiles("bank_deposits", [A]), false);
  });

  test("история ведётся отдельно для каждого ресурса", (t) => {
    const db = createDb(tmpDbPath(t));
    db.saveFiles("bank_deposits", [A]);

    assert.equal(db.hasNewFiles("pensions_and_social_insurance", [A]), true);
  });

  test("saveFiles заменяет список ресурса и не трогает остальные данные", (t) => {
    const dbPath = tmpDbPath(t);
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ users: [42], parsedFiles: { other: [C], bank_deposits: [A] } }),
    );
    const db = createDb(dbPath);

    db.saveFiles("bank_deposits", [B]);

    const saved = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    assert.deepEqual(saved, { users: [42], parsedFiles: { other: [C], bank_deposits: [B] } });
  });

  test("запись не оставляет временный файл", (t) => {
    const dbPath = tmpDbPath(t);
    const db = createDb(dbPath);

    db.saveFiles("bank_deposits", [A]);

    assert.equal(fs.existsSync(`${dbPath}.tmp`), false);
    assert.deepEqual(fs.readdirSync(path.dirname(dbPath)), ["database.json"]);
  });

  test("повреждённый файл читается как пустая база с записью в лог", (t) => {
    const dbPath = tmpDbPath(t);
    fs.writeFileSync(dbPath, "{ not json");
    const errorLog = t.mock.method(console, "error", () => {});
    const db = createDb(dbPath);

    assert.equal(db.hasNewFiles("bank_deposits", [A]), true);
    assert.equal(errorLog.mock.callCount(), 1);
    assert.match(errorLog.mock.calls[0].arguments[0], /Не удалось прочитать базу/);
  });
});
