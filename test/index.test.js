import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Сквозные тесты index.js: настоящий процесс, страница раздела — локальный сервер.

const indexPath = fileURLToPath(new URL("../index.js", import.meta.url));
const { selectors } = JSON.parse(
  fs.readFileSync(new URL("../configuration/resources.json", import.meta.url), "utf-8"),
).resources[0];

const PAGE = `<html><body>
  <div class="raisin-funds"><div id="op-inform"><p>Заголовок</p></div></div>
  <div class="info-archive-table-block__title">Дата</div><p>03.07.2026</p>
  <a class="colleges__link" href="/a.docx">docx</a>
</body></html>`;

let server;
let baseUrl;
// Запросы к /slow ждут, пока тест не вызовет release().
let slowRequested;
let releaseSlow;

// Promise.withResolvers появился только в Node 22.
function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function resetSlow() {
  slowRequested = deferred();
  const released = deferred();
  releaseSlow = released.resolve;
  return released.promise;
}

let slowReleased = resetSlow();

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.url === "/slow") {
      slowRequested.resolve();
      await slowReleased;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  releaseSlow();
  server.closeAllConnections();
  server.close();
});

async function waitFor(check, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Не дождался: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function startApp(t, pagePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kazna-app-"));
  const configPath = path.join(dir, "resources.json");
  const dbPath = path.join(dir, "database.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      resources: [{ id: "test", description: "Тестовый раздел", url: `${baseUrl}${pagePath}`, selectors }],
    }),
  );

  const child = spawn(process.execPath, [indexPath], {
    cwd: dir, // не корень проекта: пути не должны зависеть от каталога запуска
    // Минимальное окружение: без прокси и без реальных получателей писем.
    env: {
      PATH: process.env.PATH,
      CONFIG_PATH: configPath,
      DB_PATH: dbPath,
      MAIL_TO: "",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const app = {
    output: "",
    exited: once(child, "exit"),
    kill: (signal) => child.kill(signal),
    savedFiles: () =>
      fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf-8")).parsedFiles.test : undefined,
  };
  child.stdout.on("data", (chunk) => (app.output += chunk));
  child.stderr.on("data", (chunk) => (app.output += chunk));

  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return app;
}

describe("index.js", { timeout: 20_000 }, () => {
  test("обрабатывает разделы сразу при старте и останавливается по SIGTERM", async (t) => {
    const app = startApp(t, "/page");

    await waitFor(() => app.savedFiles(), "сохранения файлов в базу");
    assert.deepEqual(app.savedFiles(), [`${baseUrl}/a.docx`]);
    await waitFor(() => app.output.includes("[Первый запуск]"), "лога первого запуска");
    assert.match(app.output, /\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[Первый запуск\] Раздел test/);

    app.kill("SIGTERM");
    const [code] = await app.exited;

    assert.equal(code, 0, app.output);
    assert.match(app.output, /\[Остановка\] Готово/);
  });

  test("по SIGTERM дожидается завершения текущего запуска", async (t) => {
    slowReleased = resetSlow();
    const app = startApp(t, "/slow");

    await slowRequested.promise;
    app.kill("SIGTERM");
    await waitFor(() => app.output.includes("[Остановка] Получен SIGTERM"), "начала остановки");
    assert.equal(app.savedFiles(), undefined);

    releaseSlow();
    const [code] = await app.exited;

    assert.equal(code, 0, app.output);
    assert.deepEqual(app.savedFiles(), [`${baseUrl}/a.docx`]);
  });

  test("повторный сигнал завершает процесс немедленно", async (t) => {
    slowReleased = resetSlow();
    const app = startApp(t, "/slow");

    await slowRequested.promise;
    app.kill("SIGTERM");
    await waitFor(() => app.output.includes("[Остановка] Получен SIGTERM"), "начала остановки");
    app.kill("SIGINT");
    const [code] = await app.exited;
    releaseSlow();

    assert.equal(code, 1, app.output);
    assert.match(app.output, /Повторный SIGINT, завершаю немедленно/);
    assert.equal(app.savedFiles(), undefined);
  });
});
