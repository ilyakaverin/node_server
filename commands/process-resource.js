import { scrapeWebsite } from "../utils/scraper.js";
import { db } from "../utils/db.js";
import { formatTitlesAndLinks } from "../utils/formatter.js";

export async function processResource(bot, resource, ctx) {
  console.log(`\n--- [Старт обработки] Раздел: ${resource.id} ---`);

  let response;

  try {
    response = await scrapeWebsite(resource.url, resource.selectors);

    if (!response) {
      if (ctx) {
        ctx.reply(
          `⚠️ *Ошибка:* Не удалось получить данные для раздела ${resource.description}`,
          { parse_mode: "Markdown" },
        );
      }
      throw new Error(`Данные не получены для ${resource.id}`);
    }
  } catch (error) {
    if (ctx) {
      ctx.reply(
        `⚠️ *Ошибка:* Не удалось получить данные для раздела ${resource.description}`,
        { parse_mode: "Markdown" },
      );
    }
    console.error(
      `[Ошибка] Не удалось обработать раздел ${resource.id}:`,
      error.message,
    );
    return;
  }

  const isNewData = db.hasNewFiles(resource.id, response.fileUrls);

  if (!isNewData) {
    if (ctx) {
      ctx.reply(
        `📌 *Раздел:* ${resource.description}\n📄 *Блок:* ${response.title} \n📅 *Дата:* ${response.date}\n ${formatTitlesAndLinks(response.fileUrls)}`,
        { parse_mode: "Markdown" },
      );
    }

    console.log(
      `[Пропуск] Изменений в разделе ${resource.id} не обнаружено. Ссылки уже есть в базе.`,
    );
    return;
  }
  db.saveFiles(resource.id, response.fileUrls);

  const users = db.getUsers();

  for (const chatId of users) {
    try {
      const messageText = `📢 **Новое обновление!**\n\n📌 *Раздел:* ${resource.description}\n📄 *Блок:* ${response.title} \n📅 *Дата:* ${response.date}\n ${formatTitlesAndLinks(response.fileUrls)}`;
      await bot.telegram.sendMessage(chatId, messageText, {
        parse_mode: "Markdown",
      });
    } catch (sendError) {
      console.error(
        `[Рассылка Ошибка] Не удалось отправить файлы пользователю ${chatId}:`,
        sendError.message,
      );
    }
  }
}
