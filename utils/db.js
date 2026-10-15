import fs from 'node:fs';
import { resolvePath } from './paths.js';

const defaultData = () => ({ parsedFiles: {} });

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Создаёт хранилище поверх JSON-файла. Файл создаётся при первой записи.
 * @param {string} dbPath - путь к файлу базы
 */
export function createDb(dbPath) {
  /**
   * Читает базу. Отсутствующий файл — пустая база. Повреждённый файл
   * переносится в `<имя>.corrupt-<время>`, чтобы следующая запись его не
   * затёрла, и база считается пустой. Прочие ошибки чтения (например, нет
   * прав) пробрасываются: действовать по неизвестному состоянию нельзя.
   * @returns {{parsedFiles: Record<string, string[]>}}
   */
  function read() {
    let raw;
    try {
      raw = fs.readFileSync(dbPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') return defaultData();
      throw error;
    }

    try {
      const data = JSON.parse(raw);
      if (!isPlainObject(data) || !isPlainObject(data.parsedFiles)) {
        throw new Error('ожидался объект с полем parsedFiles');
      }
      return { parsedFiles: data.parsedFiles };
    } catch (error) {
      const backupPath = `${dbPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.renameSync(dbPath, backupPath);
      console.error(
        `[DB Error] База повреждена (${error.message}). Копия сохранена в ${backupPath}, начинаю с пустой базы.`,
      );
      return defaultData();
    }
  }

  /**
   * Атомарная запись: пишем во временный файл и переименовываем.
   * Защищает от повреждения базы при обрыве процесса посреди записи.
   * @param {object} data
   */
  function write(data) {
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, dbPath);
  }

  return {
    /**
     * Есть ли в базе история для ресурса (обрабатывался ли он раньше)
     * @param {string} resourceId - ID ресурса
     * @returns {boolean}
     */
    hasHistory(resourceId) {
      return Object.hasOwn(read().parsedFiles, resourceId);
    },

    /**
     * Проверяет, появились ли новые ссылки для конкретного ресурса
     * @param {string} resourceId - ID ресурса
     * @param {string[]} currentUrls - Ссылки с сайта
     * @returns {boolean} - true, если есть хоть одна новая ссылка для этого ID
     */
    hasNewFiles(resourceId, currentUrls) {
      if (!currentUrls || currentUrls.length === 0) return false;

      const data = read();

      // Получаем массив прошлых ссылок именно для этого ресурса
      const oldUrls = data.parsedFiles[resourceId] || [];

      // Ищем, есть ли в текущих ссылках хоть одна, которой нет в истории этого ресурса
      return currentUrls.some(url => !oldUrls.includes(url));
    },

    /**
     * Сохраняет текущий набор ссылок ресурса (заменяет предыдущий)
     * @param {string} resourceId - ID ресурса (например, "bank_deposits")
     * @param {string[]} newUrls
     */
    saveFiles(resourceId, newUrls) {
      const data = read();
      data.parsedFiles[resourceId] = newUrls;
      write(data);
    }
  };
}

export const db = createDb(resolvePath(process.env.DB_PATH, 'database.json'));
