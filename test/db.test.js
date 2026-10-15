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

  test("hasHistory различает новые и уже обработанные ресурсы", (t) => {
    const db = createDb(tmpDbPath(t));
    assert.equal(db.hasHistory("bank_deposits"), false);

    db.saveFiles("bank_deposits", [A]);

    assert.equal(db.hasHistory("bank_deposits"), true);
    assert.equal(db.hasHistory("pensions_and_social_insurance"), false);
    assert.equal(db.hasHistory("toString"), false);
  });

  test("saveFiles заменяет список ресурса, сохраняет другие ресурсы и убирает старое поле users", (t) => {
    const dbPath = tmpDbPath(t);
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ users: [42], parsedFiles: { other: [C], bank_deposits: [A] } }),
    );
    const db = createDb(dbPath);

    db.saveFiles("bank_deposits", [B]);

    const saved = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    assert.deepEqual(saved, { parsedFiles: { other: [C], bank_deposits: [B] } });
  });

  test("запись не оставляет временный файл", (t) => {
    const dbPath = tmpDbPath(t);
    const db = createDb(dbPath);

    db.saveFiles("bank_deposits", [A]);

    assert.equal(fs.existsSync(`${dbPath}.tmp`), false);
    assert.deepEqual(fs.readdirSync(path.dirname(dbPath)), ["database.json"]);
  });

  for (const [name, content] of [
    ["невалидный JSON", "{ not json"],
    ["пустой файл", ""],
    ["JSON без parsedFiles", "{}"],
    ["parsedFiles не объект", '{"parsedFiles": []}'],
    ["JSON не объект", "null"],
  ]) {
    test(`повреждённая база (${name}) переносится в копию и читается как пустая`, (t) => {
      const dbPath = tmpDbPath(t);
      fs.writeFileSync(dbPath, content);
      const errorLog = t.mock.method(console, "error", () => {});
      const db = createDb(dbPath);

      assert.equal(db.hasHistory("bank_deposits"), false);

      const files = fs.readdirSync(path.dirname(dbPath));
      assert.equal(files.length, 1);
      assert.match(files[0], /^database\.json\.corrupt-\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
      assert.equal(fs.readFileSync(path.join(path.dirname(dbPath), files[0]), "utf-8"), content);
      assert.equal(errorLog.mock.callCount(), 1);
      assert.match(errorLog.mock.calls[0].arguments[0], /База повреждена.*Копия сохранена/);
    });
  }

  test("после переноса повреждённой базы запись создаёт новую, копия не затирается", (t) => {
    const dbPath = tmpDbPath(t);
    fs.writeFileSync(dbPath, "{ not json");
    t.mock.method(console, "error", () => {});
    const db = createDb(dbPath);

    db.saveFiles("bank_deposits", [A]);

    const files = fs.readdirSync(path.dirname(dbPath)).sort();
    assert.equal(files.length, 2);
    assert.equal(files[0], "database.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(dbPath, "utf-8")), {
      parsedFiles: { bank_deposits: [A] },
    });
  });

  test("прочие ошибки чтения пробрасываются, файл не трогается", (t) => {
    const dbPath = tmpDbPath(t);
    fs.mkdirSync(dbPath); // вместо файла — каталог: EISDIR
    const db = createDb(dbPath);

    assert.throws(() => db.hasHistory("bank_deposits"), { code: "EISDIR" });
    assert.throws(() => db.saveFiles("bank_deposits", [A]), { code: "EISDIR" });
    assert.ok(fs.statSync(dbPath).isDirectory());
  });
});
