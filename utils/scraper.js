import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'node:https';

/**
 * Отказоустойчивая функция парсинга конкретной страницы
 * @param {string} url - Ссылка на страницу
 * @param {object} selectors - Объект { title, files } из JSON
 * @returns {Promise<{title: string, fileUrls: string[]}|null>}
 */
export async function scrapeWebsite(url, selectors) {
  try {
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    const { data: html } = await axios.get(url, {
      httpsAgent,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);

    const title = $(selectors.title).text().trim();
    if (!title) {
      console.warn(`[Scraper Warning] Заголовок не найден по селектору на странице: ${url}`);
      return null;
    }

    const fileUrls = [];
    $(selectors.files).each((index, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = new URL(href, url).href;
        fileUrls.push(absoluteUrl);
      }
    });

    if (fileUrls.length === 0) {
      console.warn(`[Scraper Warning] Файлы не найдены по селектору на странице: ${url}`);
      return null;
    }

    return { title, fileUrls, date: $(selectors.date).text().trim() };
  } catch (error) {
    console.error(`[Scraper Error] Критическая ошибка при парсинге ${url}:`, error.message);
    return null;
  }
}
