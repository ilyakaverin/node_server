import "dotenv/config";
import cron from "node-cron";
import { checkMailerConfig } from "./utils/mailer.js";
import { loadScraperConfig, processAllResources } from "./commands/run-resources.js";

checkMailerConfig();

// noOverlap: пока предыдущий запуск не завершился (например, завис SMTP —
// таймаут сокета в nodemailer 10 минут), новый пропускается. Иначе файлы ещё
// не сохранены в базу и одно и то же обновление уйдёт письмом повторно.
cron.schedule(
  "*/5 * * * *",
  async () => {
    const { resources } = loadScraperConfig();
    await processAllResources(resources);
  },
  { noOverlap: true },
);
