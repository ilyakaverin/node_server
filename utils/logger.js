const LEVELS = ["log", "info", "warn", "error", "debug"];

/**
 * Добавляет метку времени (ISO, UTC) в начало каждого сообщения console.
 * Вызывается один раз при старте приложения.
 * @param {Console} [target]
 */
export function enableLogTimestamps(target = console) {
  for (const level of LEVELS) {
    const original = target[level].bind(target);
    target[level] = (...args) => original(`[${new Date().toISOString()}]`, ...args);
  }
}

/**
 * Логгер для node-cron: его встроенный логгер сам ставит время и цвета,
 * а с enableLogTimestamps время выводилось бы дважды.
 */
export const cronLogger = {
  info: (message) => console.info("[node-cron]", message),
  warn: (message) => console.warn("[node-cron]", message),
  error: (message, error) => console.error("[node-cron]", message, error ?? ""),
  debug: () => {},
};
