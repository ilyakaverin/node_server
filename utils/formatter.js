/**
 * Экранирует спецсимволы для Telegram parse_mode: "HTML".
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getFileName(fileUrl, index) {
  try {
    const pathname = new URL(fileUrl).pathname;
    const rawName = pathname.substring(pathname.lastIndexOf('/') + 1);
    const decoded = rawName ? decodeURIComponent(rawName) : `Файл ${index + 1}`;
    return decoded || `Файл ${index + 1}`;
  } catch {
    return `Файл ${index + 1}`;
  }
}

export function formatTitlesAndLinks(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return '';

  return urls
    .map((fileUrl, index) => {
      const label = getFileName(fileUrl, index);
      return `- <a href="${escapeHtml(fileUrl)}">${escapeHtml(label)}</a>`;
    })
    .join('\n');
}
