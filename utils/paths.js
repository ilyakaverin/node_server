import path from "node:path";

/** Корень проекта: пути не зависят от каталога, из которого запущен процесс. */
export const rootDir = path.resolve(import.meta.dirname, "..");

/**
 * Путь из переменной окружения или путь по умолчанию.
 * Относительные пути считаются от корня проекта.
 * @param {string | undefined} envValue
 * @param {string} defaultPath
 * @returns {string}
 */
export function resolvePath(envValue, defaultPath) {
  return path.resolve(rootDir, envValue || defaultPath);
}
