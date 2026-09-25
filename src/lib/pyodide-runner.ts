"use client";

// ============================================================
// Запуск Python в браузере через Pyodide (CPython на WebAssembly).
//
// Скрипт (~10 МБ) грузится с CDN лениво — при первом задании с кодом,
// дальше браузер берёт его из кэша. Vercel это не нагружает вообще:
// код ученика выполняется у него на компьютере.
// ============================================================

const PYODIDE_VERSION = "0.28.3";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// Минимальный интерфейс той части Pyodide, которой мы пользуемся.
type Pyodide = {
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (line: string) => void }): void;
  setStderr(options: { batched: (line: string) => void }): void;
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<Pyodide>;
  }
}

let pyodidePromise: Promise<Pyodide> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = PYODIDE_BASE + "pyodide.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Не удалось загрузить Python. Проверь интернет."));
    document.head.appendChild(script);
  });
}

/** Однократная инициализация Pyodide (все задания делят один интерпретатор). */
export function getPyodide(): Promise<Pyodide> {
  if (!pyodidePromise) {
    pyodidePromise = injectScript().then(() => {
      if (!window.loadPyodide) {
        throw new Error("Pyodide не инициализировался");
      }
      return window.loadPyodide({ indexURL: PYODIDE_BASE });
    });
    // Неудачную загрузку не кэшируем — следующая попытка начнёт заново.
    pyodidePromise.catch(() => {
      pyodidePromise = null;
    });
  }
  return pyodidePromise;
}

export type RunResult = {
  /** Всё, что программа напечатала (stdout, а при ошибке — и текст ошибки). */
  output: string;
  /** true — выполнилось без исключений. */
  ok: boolean;
};

/**
 * Выполнить код ученика и собрать вывод print'ов. Ошибки Python не
 * пробрасываются наружу — возвращаются текстом в output, чтобы ученик
 * видел, что пошло не так.
 */
export async function runPython(code: string): Promise<RunResult> {
  const pyodide = await getPyodide();
  const lines: string[] = [];
  pyodide.setStdout({ batched: (line) => lines.push(line) });
  pyodide.setStderr({ batched: (line) => lines.push(line) });

  try {
    await pyodide.runPythonAsync(code);
    return { output: lines.join("\n"), ok: true };
  } catch (err) {
    // Показываем последнюю строку traceback'а — саму суть ошибки
    // (например «NameError: name 'x' is not defined»), без простыни.
    const message = err instanceof Error ? err.message : String(err);
    const gist =
      message
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "")
        .pop() ?? "Ошибка выполнения";
    return {
      output: [...lines, gist].join("\n"),
      ok: false,
    };
  }
}
