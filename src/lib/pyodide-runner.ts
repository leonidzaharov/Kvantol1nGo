"use client";

import { MAX_PRACTICE_OUTPUT } from "./practice-types";

const LOAD_TIMEOUT_MS = 45_000;
const RUN_TIMEOUT_MS = 3_000;
const LOAD_ERROR = "Не удалось загрузить Python. Проверь соединение и повтори запуск.";

export type RunResult = { output: string; ok: boolean };
type PendingRun = {
  id: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (result: RunResult) => void;
  reject: (error: Error) => void;
};
type PythonWorker = {
  worker: Worker;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  loadingTimer: ReturnType<typeof setTimeout> | null;
  loaded: boolean;
  pending: PendingRun | null;
};

let current: PythonWorker | null = null;
let nextId = 0;
let queue: Promise<void> = Promise.resolve();

function reset(state: PythonWorker, error: Error) {
  if (current !== state) return;
  current = null;
  if (state.loadingTimer !== null) clearTimeout(state.loadingTimer);
  if (!state.loaded) state.rejectReady(error);
  if (state.pending) {
    clearTimeout(state.pending.timer);
    state.pending.reject(error);
    state.pending = null;
  }
  state.worker.onmessage = null;
  state.worker.onerror = null;
  state.worker.onmessageerror = null;
  state.worker.terminate();
}

/** Lazily warm one worker. A failed load never poisons the next attempt. */
export function getPyodide(): Promise<void> {
  if (current) return current.ready;
  let worker: Worker;
  try {
    worker = new Worker("/pyodide-worker.js");
  } catch {
    return Promise.reject(new Error(LOAD_ERROR));
  }
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const state: PythonWorker = { worker, ready, resolveReady, rejectReady, loadingTimer: null, loaded: false, pending: null };
  current = state;
  state.loadingTimer = setTimeout(() => reset(state, new Error(LOAD_ERROR)), LOAD_TIMEOUT_MS);
  worker.onerror = () => reset(state, new Error("Python остановился. Повтори запуск."));
  worker.onmessageerror = () => reset(state, new Error("Не удалось получить результат Python. Повтори запуск."));
  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (current !== state || !event.data || typeof event.data !== "object") return;
    const message = event.data as Record<string, unknown>;
    if (message.type === "ready" && !state.loaded) {
      if (state.loadingTimer !== null) clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
      state.loaded = true;
      state.resolveReady();
    } else if (message.type === "load-error" || message.type === "fatal") {
      reset(state, new Error(LOAD_ERROR));
    } else if ((message.type === "result" || message.type === "output-limit") && state.pending && state.pending.id === message.id) {
      if (typeof message.ok !== "boolean" || typeof message.output !== "string") {
        reset(state, new Error("Python вернул некорректный результат. Повтори запуск."));
        return;
      }
      const pending = state.pending;
      state.pending = null;
      clearTimeout(pending.timer);
      pending.resolve({ ok: message.type === "result" && message.ok, output: message.output.slice(0, MAX_PRACTICE_OUTPUT) });
      if (message.type === "output-limit") reset(state, new Error("Превышен предел вывода Python."));
    }
  };
  try {
    worker.postMessage({ type: "load" });
  } catch {
    reset(state, new Error(LOAD_ERROR));
  }
  return ready;
}

/** Runtime mistakes resolve; worker/network failures reject without grading. */
export function runPython(code: string): Promise<RunResult> {
  const task = queue.then(async () => {
    await getPyodide();
    const state = current;
    if (!state?.loaded) throw new Error(LOAD_ERROR);
    return new Promise<RunResult>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        if (current !== state || state.pending?.id !== id) return;
        state.pending = null;
        resolve({ ok: false, output: "Программа выполнялась слишком долго. Проверь условие цикла и изменение переменных внутри него." });
        reset(state, new Error("Время выполнения Python истекло."));
      }, RUN_TIMEOUT_MS);
      state.pending = { id, resolve, reject, timer };
      try {
        state.worker.postMessage({ type: "run", id, code });
      } catch {
        reset(state, new Error("Не удалось запустить Python. Повтори запуск."));
      }
    });
  });
  queue = task.then(() => undefined, () => undefined);
  return task;
}
