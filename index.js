import "dotenv/config";
import cron from "node-cron";
import path from "node:path";
import fs from "node:fs";
import { processResource } from "./commands/process-resource.js";

function loadScraperConfig() {
  const configPath = path.join(process.cwd(), "configuration/resources.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}


cron.schedule("*/1 * * * *", () => {
  const { resources } = loadScraperConfig();

  resources.forEach((resource) => {
    processResource(resource);
  });
});

