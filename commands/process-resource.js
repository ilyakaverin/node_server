import { scrapeWebsite } from "../utils/scraper.js";
import { db } from "../utils/db.js";
import { formatTitlesAndLinks, escapeHtml } from "../utils/formatter.js";

export async function processResource(bot, resource, ctx) {
  console.log(`\n--- [Старт обработки] Раздел: ${resource.id} ---`);

  // scrapeWebsite сам перехватывает ошибки и возвращает null — отдельный try/catch не нужен.
  const response = await scrapeWebsite(resource.url, resource.selectors);

  if (!response) {
    if (ctx) {
      await ctx.reply(
        `⚠️ <b>Ошибка:</b> Не удалось получить данные для раздела ${escapeHtml(resource.description)}`,
        { parse_mode: "HTML" },
      );
    }
    console.error(`[Ошибка] Не удалось обработать раздел ${resource.id}`);
    return;
  }

  const description = escapeHtml(resource.description);
  const title = escapeHtml(response.title);
  const date = escapeHtml(response.date);
  const links = formatTitlesAndLinks(response.fileUrls);

  const isNewData = db.hasNewFiles(resource.id, response.fileUrls);

  if (!isNewData) {
    if (ctx) {
      await ctx.reply(
        `📌 <b>Раздел:</b> ${description}\n📄 <b>Блок:</b> ${title}\n📅 <b>Дата:</b> ${date}\n${links}`,
        { parse_mode: "HTML" },
      );
    }

    console.log(
      `[Пропуск] Изменений в разделе ${resource.id} не обнаружено. Ссылки уже есть в базе.`,
    );
    return;
  }

  const users = db.getUsers();
  const messageText = `📢 <b>Новое обновление!</b>\n\n📌 <b>Раздел:</b> ${description}\n📄 <b>Блок:</b> ${title}\n📅 <b>Дата:</b> ${date}\n${links}`;

  let delivered = false;
  for (const chatId of users) {
    try {
      await bot.telegram.sendMessage(chatId, messageText, {
        parse_mode: "HTML",
      });
      delivered = true;
    } catch (sendError) {
      console.error(
        `[Рассылка Ошибка] Не удалось отправить файлы пользователю ${chatId}:`,
        sendError.message,
      );
    }
  }

  // Сохраняем как «просмотренное» только после успешной доставки (или если
  // получателей нет). Иначе сбой рассылки навсегда потерял бы это обновление.
  if (delivered || users.length === 0) {
    db.saveFiles(resource.id, response.fileUrls);
  }
}
