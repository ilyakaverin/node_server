import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cronLogger, enableLogTimestamps } from "../utils/logger.js";

const ISO = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/;

function fakeConsole() {
  const calls = [];
  const target = {};
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    target[level] = (...args) => calls.push({ level, args });
  }
  return { target, calls };
}

describe("enableLogTimestamps", () => {
  test("добавляет метку времени первым аргументом, остальные не меняет", () => {
    const { target, calls } = fakeConsole();
    enableLogTimestamps(target);

    const error = new Error("boom");
    target.log("сообщение", 42);
    target.error("ошибка:", error);

    assert.equal(calls.length, 2);
    assert.match(calls[0].args[0], ISO);
    assert.deepEqual(calls[0].args.slice(1), ["сообщение", 42]);
    assert.equal(calls[1].level, "error");
    assert.match(calls[1].args[0], ISO);
    assert.equal(calls[1].args[2], error);
  });

  test("оборачивает все уровни", () => {
    const { target, calls } = fakeConsole();
    enableLogTimestamps(target);

    for (const level of ["log", "info", "warn", "error", "debug"]) target[level]("x");

    assert.deepEqual(
      calls.map((call) => call.level),
      ["log", "info", "warn", "error", "debug"],
    );
    assert.ok(calls.every((call) => ISO.test(call.args[0])));
  });
});

describe("cronLogger", () => {
  test("пишет через console с префиксом node-cron, без своей метки времени", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const error = t.mock.method(console, "error", () => {});
    const failure = new Error("task failed");

    cronLogger.warn("task still running");
    cronLogger.error("Task failed with error!", failure);
    cronLogger.debug("ignored");

    assert.deepEqual(warn.mock.calls[0].arguments, ["[node-cron]", "task still running"]);
    assert.deepEqual(error.mock.calls[0].arguments, ["[node-cron]", "Task failed with error!", failure]);
  });
});
