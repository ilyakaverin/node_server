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

// Повтор сигнала раньше этого срока — дубль того же запроса на остановку:
// под `npm start` один Ctrl+C или `systemctl stop` доходит до node дважды
// (напрямую и через npm), с разницей в доли миллисекунды.
const DUPLICATE_SIGNAL_MS = 1000;

let stopRequestedAt = null;

// Корректная остановка: новые запуски не начинаем, текущий доводим до конца,
// чтобы не оборвать рассылку до сохранения файлов в базу.
async function shutdown(signal) {
  if (stopRequestedAt !== null) {
    if (Date.now() - stopRequestedAt < DUPLICATE_SIGNAL_MS) return;
    console.warn(`[Остановка] Повторный ${signal}, завершаю немедленно`);
    process.exit(1);
  }
  stopRequestedAt = Date.now();
  console.log(`[Остановка] Получен ${signal}, жду завершения текущего запуска...`);
  task.stop();
  await job.idle();
  console.log("[Остановка] Готово");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
