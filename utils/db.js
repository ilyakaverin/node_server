import fs from 'node:fs';
import path from 'node:path';

const defaultData = () => ({ users: [], parsedFiles: {} });

/**
 * Создаёт хранилище поверх JSON-файла. Файл создаётся при первой записи.
 * @param {string} dbPath - путь к файлу базы
 */
export function createDb(dbPath) {
  /**
   * Читает базу. При отсутствующем, повреждённом или нечитаемом файле
   * возвращает пустую структуру, чтобы бот не падал на JSON.parse.
   * @returns {{users: number[], parsedFiles: Record<string, string[]>}}
   */
  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      return {
        users: data.users || [],
        parsedFiles: data.parsedFiles || {},
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[DB Error] Не удалось прочитать базу, использую пустую:', error.message);
      }
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

export const db = createDb(process.env.DB_PATH || path.join(process.cwd(), 'database.json'));
