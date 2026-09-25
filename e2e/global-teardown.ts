import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";

import { dropSandbox } from "./sandbox";

export default async function globalTeardown() {
  await dropSandbox();
  await rm(path.join(process.cwd(), "e2e", ".fixtures.json"), { force: true });
  console.log("\n[e2e] Песочница удалена. Схема public не затрагивалась.");
}
