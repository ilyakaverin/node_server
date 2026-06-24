import { Telegraf } from "telegraf";
import "dotenv/config";
import { db } from "./utils/db.js";
import cron from "node-cron";
import path from "node:path";
import fs from "node:fs";
import { processResource } from "./commands/process-resource.js";
import { formatTitlesAndLinks } from "./utils/formatter.js";

if (!process.env.TOKEN) {
  throw new Error("TOKEN отсутствует в .env");
}

const bot = new Telegraf(process.env.TOKEN);

function loadScraperConfig() {
  const configPath = path.join(process.cwd(), "configuration/resources.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

bot.start(async (ctx) => {
  db.addUser(ctx.chat.id);
  await ctx.reply("Вы подписались на обновления файлов! Проверка наличия новых файлов будет происходить каждые 2 минуты. Если название актуального файла изменится, значит файл обновился и вам придет оповещение");
  const { resources } = loadScraperConfig();

  resources.forEach((resource) => {
    const urls = db.getUrlsByResourceId(resource.id);

    ctx.reply(
      `📌 *Раздел:* ${resource.description}\n📄\n ${formatTitlesAndLinks(urls)}`,
      { parse_mode: "Markdown" },
    );
  });
});

bot.catch((err, ctx) => {
  console.error(
    "Ошибка при обработке апдейта:",
    ctx?.update?.update_id ?? "-",
    err,
  );
});

bot.command("check", (ctx) => {
  const { resources } = loadScraperConfig();

  resources.forEach((resource) => {
    const urls = db.getUrlsByResourceId(resource.id);

    ctx.reply(
      `📌 *Раздел:* ${resource.description}\n📄\n ${formatTitlesAndLinks(urls)}`,
      { parse_mode: "Markdown" },
    );
  });
});

cron.schedule("*/2 * * * *", () => {
  const { resources } = loadScraperConfig();

  resources.forEach((resource) => {
    processResource(bot, resource);
  });
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
