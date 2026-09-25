import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createSandbox } from "./sandbox";

// Поднимаем схему-песочницу ДО старта dev-сервера (Playwright запускает
// webServer уже после global setup). Id созданного урока кладём в файл —
// спеки читают его оттуда.
export default async function globalSetup() {
  console.log("\n[e2e] Готовлю схему-песочницу…");
  const fixtures = await createSandbox();
  await writeFile(
    path.join(process.cwd(), "e2e", ".fixtures.json"),
    JSON.stringify(fixtures),
  );
  console.log(`[e2e] Песочница готова, урок id=${fixtures.lessonId}\n`);
}
