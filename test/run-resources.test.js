import { describe, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { loadScraperConfig, processAllResources } from "../commands/run-resources.js";
import { resolvePath, rootDir } from "../utils/paths.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("processAllResources", () => {
  test("сбой одного ресурса не прерывает остальные и логируется", async (t) => {
    const error = t.mock.method(console, "error", () => {});
    const processed = [];

    await processAllResources([{ id: "broken" }, { id: "ok" }], async (resource) => {
      if (resource.id === "broken") throw new Error("disk full");
      processed.push(resource.id);
    });

    assert.deepEqual(processed, ["ok"]);
    assert.equal(error.mock.callCount(), 1);
    assert.match(error.mock.calls[0].arguments[0], /broken/);
    assert.equal(error.mock.calls[0].arguments[1].message, "disk full");
  });

  test("синхронное исключение обработчика тоже не выходит наружу", async (t) => {
    t.mock.method(console, "error", () => {});

    await assert.doesNotReject(
      processAllResources([{ id: "sync" }], () => {
        throw new Error("boom");
      }),
    );
  });

  // На этом держится noOverlap в node-cron: запуск считается завершённым,
  // только когда промис колбэка разрешился.
  test("завершается только после обработки всех ресурсов", async () => {
    const finished = [];

    await processAllResources([{ id: "slow" }, { id: "fast" }], async (resource) => {
      await sleep(resource.id === "slow" ? 50 : 1);
      finished.push(resource.id);
    });

    assert.deepEqual(finished.sort(), ["fast", "slow"]);
  });
});

describe("пути", () => {
  test("корень проекта — каталог с package.json", () => {
    assert.equal(rootDir, path.resolve(import.meta.dirname, ".."));
  });

  test("resolvePath: относительные пути от корня проекта, абсолютные как есть", () => {
    assert.equal(resolvePath(undefined, "database.json"), path.join(rootDir, "database.json"));
    assert.equal(resolvePath("", "database.json"), path.join(rootDir, "database.json"));
    assert.equal(resolvePath("data/db.json", "database.json"), path.join(rootDir, "data/db.json"));
    assert.equal(resolvePath("/var/lib/kazna/db.json", "database.json"), "/var/lib/kazna/db.json");
  });

  test("конфигурация читается независимо от текущего каталога процесса", (t) => {
    const cwd = process.cwd();
    t.after(() => process.chdir(cwd));
    process.chdir(os.tmpdir());

    assert.ok(loadScraperConfig().resources.length > 0);
  });
});

describe("configuration/resources.json", () => {
  const { resources } = loadScraperConfig();

  test("содержит хотя бы один ресурс", () => {
    assert.ok(Array.isArray(resources) && resources.length > 0);
  });

  test("id ресурсов уникальны (по ним ведётся история в базе)", () => {
    const ids = resources.map((resource) => resource.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  for (const resource of resources) {
    test(`ресурс ${resource.id} заполнен корректно`, () => {
      assert.ok(resource.id, "нет id");
      assert.ok(resource.description, "нет description");
      assert.equal(new URL(resource.url).protocol, "https:");
      assert.ok(resource.selectors?.title, "нет selectors.title");
      assert.ok(resource.selectors?.files, "нет selectors.files");
    });
  }
});
