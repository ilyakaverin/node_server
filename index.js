import "./utils/load-env.js";
import cron from "node-cron";
import { enableLogTimestamps, cronLogger } from "./utils/logger.js";
import { checkMailerConfig } from "./utils/mailer.js";
import { createJob } from "./utils/job.js";
import { loadScraperConfig, processAllResources } from "./commands/run-resources.js";

enableLogTimestamps();
checkMailerConfig();

// Один запуск за раз — и по расписанию, и при старте (см. createJob).
const job = createJob(async () => {
  const { resources } = loadScraperConfig();
  await processAllResources(resources);
});

const task = cron.schedule("*/5 * * * *", () => job.run(), { logger: cronLogger });

// Первый запуск сразу, не дожидаясь ближайшего срабатывания расписания.
job.run().catch((error) => {
  console.error("[Ошибка] Сбой запуска при старте:", error);
});

let stopping = false;

// Корректная остановка: новые запуски не начинаем, текущий доводим до конца,
// чтобы не оборвать рассылку до сохранения файлов в базу.
async function shutdown(signal) {
  if (stopping) {
    console.warn(`[Остановка] Повторный ${signal}, завершаю немедленно`);
    process.exit(1);
  }
  stopping = true;
  console.log(`[Остановка] Получен ${signal}, жду завершения текущего запуска...`);
  task.stop();
  await job.idle();
  console.log("[Остановка] Готово");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
