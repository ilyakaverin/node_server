/**
 * Экранирует спецсимволы HTML, чтобы данные не ломали разметку письма.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
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

function formatTitlesAndLinks(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return '';

  return urls
    .map((fileUrl, index) => {
      const label = getFileName(fileUrl, index);
      return `- <a href="${escapeHtml(fileUrl)}">${escapeHtml(label)}</a>`;
    })
    .join('\n');
}

/**
 * Формирует тему и HTML-тело письма об обновлении раздела.
 * Все пользовательские данные экранируются здесь.
 * @param {{description: string}} resource - ресурс из конфигурации
 * @param {{title: string, date: string, fileUrls: string[]}} response - результат парсинга
 * @returns {{subject: string, html: string}}
 */
export function formatUpdateEmail(resource, response) {
  const description = escapeHtml(resource.description);
  const title = escapeHtml(response.title);
  const date = escapeHtml(response.date);
  const links = formatTitlesAndLinks(response.fileUrls).replaceAll('\n', '<br>');

  const subject = `Новое обновление: ${response.title}`;
  const html = `<p>📢 <b>Новое обновление!</b></p>
<p>📌 <b>Раздел:</b> ${description}</p>
<p>📄 <b>Блок:</b> ${title}</p>
<p>📅 <b>Дата:</b> ${date}</p>
<p>${links}</p>`;

  return { subject, html };
}
