"use client";

// ============================================================
// Запуск JavaScript ученика прямо в браузере, в отдельном Web Worker.
//
// Зачем worker, а не eval на главном потоке: код ученика может содержать
// бесконечный цикл (`while (true) {}`). В worker'е такой цикл повесит только
// сам worker — главный поток жив, и мы по таймауту его завершаем. Плюс worker
// не видит DOM/куки страницы, так что «сломать сайт» из задания нельзя.
//
// Vercel это не нагружает: код выполняется на компьютере ученика.
// ============================================================

import type { RunResult } from "./pyodide-runner";

// Бесконечный цикл или слишком долгая программа обрываются по таймауту.
const TIMEOUT_MS = 3000;

// Тело worker'а (строкой — грузим его через Blob, без отдельного файла).
// Перехватываем console.* и собираем вывод построчно, как print в Python.
const WORKER_SOURCE = `
self.onmessage = function (e) {
  var code = e.data;
  var lines = [];
  function format(args) {
    return Array.prototype.map.call(args, function (a) {
      if (typeof a === "string") return a;
      if (a === undefined) return "undefined";
      try {
        var s = JSON.stringify(a);
        return s === undefined ? String(a) : s;
      } catch (err) {
        return String(a);
      }
    }).join(" ");
  }
  function push() { lines.push(format(arguments)); }
  console.log = push;
  console.info = push;
  console.warn = push;
  console.error = push;
  console.debug = push;
  // Оборачиваем код ученика в async-IIFE: так работает верхнеуровневый await,
  // а Promise-обёртка ловит и синхронные ошибки, и возвращённый промис.
  // Переводы строк вокруг кода не дают комментарию "//" съесть закрытие.
  Promise.resolve()
    .then(function () { return (0, eval)("(async () => {\\n" + code + "\\n})()"); })
    .then(function () {
      self.postMessage({ output: lines.join("\\n"), ok: true });
    })
    .catch(function (err) {
      var msg = err && err.name ? err.name + ": " + err.message : String(err);
      self.postMessage({ output: lines.concat([msg]).join("\\n"), ok: false });
    });
};
`;

/**
 * Выполнить JavaScript ученика и собрать вывод console.log. Ошибки не
 * пробрасываются — возвращаются текстом в output, как у runPython, чтобы
 * ученик видел, что пошло не так.
 */
export function runJavaScript(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    let blobUrl: string;
    try {
      const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
    } catch {
      resolve({
        output: "Не удалось запустить JavaScript в этом браузере.",
        ok: false,
      });
      return;
    }

    let done = false;
    const finish = (result: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        output:
          "Программа выполнялась слишком долго — возможно, бесконечный цикл (while/for без выхода).",
        ok: false,
      });
    }, TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<RunResult>) => finish(e.data);
    worker.onerror = (e: ErrorEvent) =>
      finish({ output: e.message || "Ошибка выполнения.", ok: false });

    worker.postMessage(code);
  });
}
