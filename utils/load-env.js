import path from "node:path";
import dotenv from "dotenv";
import { rootDir } from "./paths.js";

// .env берём из корня проекта, а не из текущего каталога процесса.
// Модуль импортируется первым в index.js, до модулей, читающих process.env.
// quiet: баннер dotenv печатается до включения меток времени в логах.
dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });
