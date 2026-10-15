import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createJob } from "../utils/job.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createJob", () => {
  test("выполняет задачу и возвращает её завершение", async () => {
    let calls = 0;
    const job = createJob(async () => {
      calls++;
    });

    await job.run();

    assert.equal(calls, 1);
  });

  test("пока задача выполняется, новый запуск пропускается с предупреждением", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const gate = deferred();
    let calls = 0;
    const job = createJob(async () => {
      calls++;
      await gate.promise;
    });

    const first = job.run();
    await job.run(); // пропущенный запуск завершается сразу

    assert.equal(calls, 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /Предыдущий запуск ещё не завершён/);

    gate.resolve();
    await first;
    await job.run();
    assert.equal(calls, 2);
  });

  test("ошибка задачи возвращается вызывающему и не блокирует следующие запуски", async () => {
    let fail = true;
    const job = createJob(async () => {
      if (fail) throw new Error("boom");
    });

    await assert.rejects(job.run(), /boom/);
    fail = false;
    await assert.doesNotReject(job.run());
  });

  test("синхронное исключение задачи превращается в отклонённый промис", async () => {
    const job = createJob(() => {
      throw new Error("sync boom");
    });

    await assert.rejects(job.run(), /sync boom/);
  });

  test("idle() ждёт текущий запуск и не бросает при его ошибке", async () => {
    const gate = deferred();
    const job = createJob(() => gate.promise);
    const events = [];

    const running = job.run().catch(() => events.push("run rejected"));
    const idle = job.idle().then(() => events.push("idle"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, []);

    gate.reject(new Error("boom"));
    await Promise.all([running, idle]);
    assert.deepEqual(events.sort(), ["idle", "run rejected"]);
  });

  test("idle() без текущего запуска завершается сразу", async () => {
    const job = createJob(async () => {});

    await job.idle();
  });
});
