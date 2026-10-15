import path from "node:path";
import dotenv from "dotenv";
import { rootDir } from "./paths.js";

// .env берём из корня проекта, а не из текущего каталога процесса.
// Модуль импортируется первым в index.js, до модулей, читающих process.env.
dotenv.config({ path: path.join(rootDir, ".env") });
