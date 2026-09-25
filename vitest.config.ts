import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Минимальный конфиг: гоняем юнит-тесты на чистую логику (без БД и Next).
// Тестовые файлы — рядом с кодом, с суффиксом .test.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "deploy/**/*.test.mjs"],
    environment: "node",
  },
});
