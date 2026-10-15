import path from "node:path";
import fs from "node:fs";
import { processResource } from "./process-resource.js";

const defaultConfigPath = path.join(process.cwd(), "configuration/resources.json");

export function loadScraperConfig(configPath = defaultConfigPath) {
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Обрабатывает все ресурсы параллельно. Сбой одного ресурса логируется и не
 * мешает остальным: необработанный reject завершил бы процесс Node целиком.
 * Промис завершается только после обработки всех ресурсов — на этом держится
 * защита node-cron от наложения запусков (noOverlap).
 * @param {object[]} resources
 * @param {(resource: object) => Promise<void>} [handle]
 */
export async function processAllResources(resources, handle = processResource) {
  const results = await Promise.allSettled(
    resources.map(async (resource) => handle(resource)),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[Ошибка] Сбой при обработке раздела ${resources[index].id}:`,
        result.reason,
      );
    }
  });
}
