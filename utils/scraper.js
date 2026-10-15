import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { rootDir } from './paths.js';

// Ошибки проверки цепочки сертификатов — к ним добавляем подсказку в лог.
const TLS_ERROR_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'CERT_UNTRUSTED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/**
 * Читает сертификаты (*.pem, *.crt) из каталога. Нет каталога — нет сертификатов.
 * @param {string} dir
 * @returns {string[]} содержимое файлов в PEM
 */
export function loadCertificates(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(pem|crt)$/i.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf-8'));
}

/**
 * HTTPS-агент, который доверяет стандартным корневым сертификатам и, кроме них,
 * переданным (сертификаты НУЦ Минцифры, которыми подписаны сайты госорганов).
 * @param {string[]} [extraCa] - дополнительные сертификаты в PEM
 * @returns {https.Agent}
 */
export function createHttpsAgent(extraCa = []) {
  // Опция ca заменяет хранилище по умолчанию, поэтому передаём его целиком.
  // getCACertificates (Node 22.15+) учитывает и NODE_EXTRA_CA_CERTS.
  const defaultCa = tls.getCACertificates
    ? tls.getCACertificates('default')
    : tls.rootCertificates;
  return new https.Agent({ ca: [...defaultCa, ...extraCa] });
}

const defaultHttpsAgent = createHttpsAgent(loadCertificates(path.join(rootDir, 'certs')));

/**
 * Текст всех найденных элементов через пробел, без лишних пробелов и переносов.
 * @param {cheerio.CheerioAPI} $
 * @param {string} selector
 * @returns {string}
 */
function extractText($, selector) {
  return $(selector)
    .map((index, element) => $(element).text())
    .get()
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Отказоустойчивая функция парсинга конкретной страницы
 * @param {string} url - Ссылка на страницу
 * @param {object} selectors - Объект { title, files, date } из JSON
 * @param {{httpsAgent?: https.Agent}} [options]
 * @returns {Promise<{title: string, fileUrls: string[], date: string}|null>}
 */
export async function scrapeWebsite(url, selectors, { httpsAgent = defaultHttpsAgent } = {}) {
  try {
    const { data: html } = await axios.get(url, {
      httpsAgent,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);

    const title = extractText($, selectors.title);
    if (!title) {
      console.warn(`[Scraper Warning] Заголовок не найден по селектору на странице: ${url}`);
      return null;
    }

    const fileUrls = [];
    $(selectors.files).each((index, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      let fileUrl;
      try {
        fileUrl = new URL(href, url);
      } catch {
        console.warn(`[Scraper Warning] Некорректная ссылка "${href}" на странице: ${url}`);
        return;
      }

      if (fileUrl.protocol !== 'http:' && fileUrl.protocol !== 'https:') {
        console.warn(`[Scraper Warning] Пропущена ссылка не на http(s) "${href}" на странице: ${url}`);
        return;
      }

      fileUrls.push(fileUrl.href);
    });

    const uniqueFileUrls = [...new Set(fileUrls)];

    if (uniqueFileUrls.length === 0) {
      console.warn(`[Scraper Warning] Файлы не найдены по селектору на странице: ${url}`);
      return null;
    }

    const date = selectors.date ? extractText($, selectors.date) : '';

    return { title, fileUrls: uniqueFileUrls, date };
  } catch (error) {
    const hint = TLS_ERROR_CODES.has(error.code)
      ? ' (сертификат сайта не прошёл проверку — проверьте каталог certs/)'
      : '';
    console.error(`[Scraper Error] Критическая ошибка при парсинге ${url}:`, error.message + hint);
    return null;
  }
}
