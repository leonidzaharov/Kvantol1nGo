// Копирует файлы Pyodide из node_modules в public/pyodide: интерпретатор
// Python отдаём со своего сервера, а не с jsdelivr — уроки с кодом
// работают без интернета на внешние CDN и не зависят от его доступности.
// Запускается postinstall'ом; в деплое на Debian это часть `npm ci`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pyodideDir = path.dirname(require.resolve("pyodide/package.json"));
const target = path.join(process.cwd(), "public", "pyodide");

const FILES = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!existsSync(pyodideDir)) {
  console.error("[pyodide] пакет pyodide не установлен — пропускаю копирование");
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(path.join(pyodideDir, file), path.join(target, file));
}
console.log(`[pyodide] ${FILES.length} файлов → public/pyodide/`);
