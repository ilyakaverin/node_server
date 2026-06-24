import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'database.json');

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], parsedFiles: {} }, null, 2));
}

export const db = {
  getUsers() {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    return data.users || [];
  },
  addUser(chatId) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    if (!data.users.includes(chatId)) {
      data.users.push(chatId);
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    }
  },

  /**
   * Проверяет, появились ли новые ссылки для конкретного ресурса
   * @param {string} resourceId - ID ресурса 
   * @param {string[]} currentUrls - Ссылки с сайта
   * @returns {boolean} - true, если есть хоть одна новая ссылка для этого ID
   */
  hasNewFiles(resourceId, currentUrls) {
    if (!currentUrls || currentUrls.length === 0) return false;
    
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // Получаем массив прошлых ссылок именно для этого ресурса
    const oldUrls = data.parsedFiles?.[resourceId] || [];

    // Ищем, есть ли в текущих ссылках хоть одна, которой нет в истории этого ресурса
    return currentUrls.some(url => !oldUrls.includes(url));
  },

  /**
   * Добавляет новые ссылки в JSON-базу для конкретного ресурса
   * @param {string} resourceId - ID ресурса (например, "bank_deposits")
   * @param {string[]} newUrls 
   */
  saveFiles(resourceId, newUrls) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    if (!data.parsedFiles) data.parsedFiles = {};
    if (!data.parsedFiles[resourceId]) data.parsedFiles[resourceId] = [];

    data.parsedFiles[resourceId] = newUrls;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  },

  /**
   * Возвращает массив сохраненных URL для конкретного ресурса
   * @param {string} resourceId - ID ресурса
   * @returns {string[]} - список URL
   */
  getUrlsByResourceId(resourceId) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    return data.parsedFiles?.[resourceId] || [];
  }
};
