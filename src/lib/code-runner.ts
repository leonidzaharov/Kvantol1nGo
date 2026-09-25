"use client";

// ============================================================
// Единая точка запуска код-заданий: по языку вопроса выбираем раннер —
// Python (Pyodide) или JavaScript (Web Worker). QuestRunner и админская
// форма урока ходят только сюда, не зная про конкретные движки.
// ============================================================

import type { CodeLanguage } from "./lesson-content";
import { getPyodide, runPython, type RunResult } from "./pyodide-runner";
import { runJavaScript } from "./js-runner";

export type { RunResult } from "./pyodide-runner";

/** Человекочитаемое имя языка — для меток в UI. */
export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
};

/** Запустить код ученика на нужном языке и собрать вывод. */
export function runCode(
  language: CodeLanguage,
  code: string,
): Promise<RunResult> {
  return language === "javascript" ? runJavaScript(code) : runPython(code);
}

/**
 * Начать прогрев движка заранее (пока ученик читает теорию). Тяжёлый только
 * Python — его интерпретатор (~10 МБ) тянется с CDN; JavaScript греть нечего.
 */
export function prewarmCode(language: CodeLanguage): void {
  if (language === "python") {
    void getPyodide().catch(() => {
      /* ошибку покажем при реальном запуске */
    });
  }
}
