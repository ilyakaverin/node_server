import { scrapeWebsite } from "../utils/scraper.js";
import { db } from "../utils/db.js";
import { formatUpdateEmail } from "../utils/formatter.js";
import { sendMail, getRecipients } from "../utils/mailer.js";

const defaultDeps = { scrapeWebsite, db, sendMail, getRecipients };

/**
 * Парсит раздел и рассылает письмо, если на странице появились новые файлы.
 * @param {object} resource - ресурс из configuration/resources.json
 * @param {Partial<typeof defaultDeps>} [deps] - зависимости (подменяются в тестах)
 */
export async function processResource(resource, deps = {}) {
  const { scrapeWebsite, db, sendMail, getRecipients } = { ...defaultDeps, ...deps };

  console.log(`\n--- [Старт обработки] Раздел: ${resource.id} ---`);

  const response = await scrapeWebsite(resource.url, resource.selectors);

  if (!response) {
    console.error(`[Ошибка] Не удалось обработать раздел ${resource.id}`);
    return;
  }

  const isNewData = db.hasNewFiles(resource.id, response.fileUrls);

  if (!isNewData) {
    console.log(
      `[Пропуск] Изменений в разделе ${resource.id} не обнаружено. Ссылки уже есть в базе.`,
    );
    return;
  }

  const recipients = getRecipients();
  const { subject, html } = formatUpdateEmail(resource, response);

  // Отправляем каждому получателю отдельно: сбой одного адреса не должен
  // блокировать доставку остальным и приводить к повторной рассылке всем.
  const results = await Promise.all(
    recipients.map((to) => sendMail({ to, subject, html })),
  );
  const succeeded = results.filter(Boolean).length;
  const failed = recipients.length - succeeded;
  const delivered = succeeded > 0;

  if (recipients.length > 0) {
    console.log(
      `[Рассылка] Раздел ${resource.id}: доставлено ${succeeded}/${recipients.length}` +
        (failed > 0 ? ` (ошибок: ${failed})` : ""),
    );
  }

  // Сохраняем как «просмотренное» только после успешной доставки (или если
  // получателей нет). Иначе сбой рассылки навсегда потерял бы это обновление.
  if (delivered || recipients.length === 0) {
    db.saveFiles(resource.id, response.fileUrls);
  }
}
