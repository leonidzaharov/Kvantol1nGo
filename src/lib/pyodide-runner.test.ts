import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_PRACTICE_OUTPUT } from "./practice-types";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  messages: Record<string, unknown>[] = [];
  constructor(readonly url: string) { FakeWorker.instances.push(this); }
  postMessage(message: Record<string, unknown>) { this.messages.push(message); }
  emit(message: unknown) { this.onmessage?.({ data: message } as MessageEvent<unknown>); }
  runs() { return this.messages.filter((message) => message.type === "run"); }
}

let runner: typeof import("./pyodide-runner");
const flush = () => vi.advanceTimersByTimeAsync(0);

async function warm() {
  const ready = runner.getPyodide();
  const worker = FakeWorker.instances.at(-1)!;
  worker.emit({ type: "ready" });
  await ready;
  return worker;
}

describe("Python worker lifecycle", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    runner = await import("./pyodide-runner");
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads lazily and shares one warm-up without executing learner code", async () => {
    expect(FakeWorker.instances).toHaveLength(0);
    const first = runner.getPyodide();
    expect(runner.getPyodide()).toBe(first);
    const worker = FakeWorker.instances[0];
    expect(worker.url).toBe("/pyodide-worker.js");
    expect(worker.messages).toEqual([{ type: "load" }]);
    worker.emit({ type: "ready" });
    await first;
    expect(worker.runs()).toHaveLength(0);
  });

  it("serializes runs so stdout cannot be assigned to another attempt", async () => {
    const worker = await warm();
    const first = runner.runPython("print(1)");
    const second = runner.runPython("print(2)");
    await flush();
    expect(worker.runs()).toHaveLength(1);
    const firstId = worker.runs()[0].id;
    worker.emit({ type: "result", id: -1, ok: true, output: "stale" });
    expect(worker.runs()).toHaveLength(1);
    worker.emit({ type: "result", id: firstId, ok: true, output: "1" });
    await expect(first).resolves.toEqual({ ok: true, output: "1" });
    await flush();
    expect(worker.runs()).toHaveLength(2);
    worker.emit({ type: "result", id: worker.runs()[1].id, ok: true, output: "2" });
    await expect(second).resolves.toEqual({ ok: true, output: "2" });
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("rejects a loading timeout and permits a fresh engine without grading", async () => {
    const failed = expect(runner.runPython("print(1)")).rejects.toThrow("Не удалось загрузить Python");
    await vi.advanceTimersByTimeAsync(45_000);
    await failed;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const worker = await warm();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(worker.runs()).toHaveLength(0);
  });

  it("returns runtime mistakes normally and reuses the working interpreter", async () => {
    const worker = await warm();
    const task = runner.runPython('print("name: " + [])');
    await flush();
    worker.emit({ type: "result", id: worker.runs()[0].id, ok: false, output: "TypeError: invalid value" });
    await expect(task).resolves.toEqual({ ok: false, output: "TypeError: invalid value" });
    expect(worker.terminate).not.toHaveBeenCalled();
    await warm();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("terminates an infinite run after warm-up and ignores its late response", async () => {
    const worker = await warm();
    const oldHandler = worker.onmessage!;
    const task = runner.runPython("while True: pass");
    await flush();
    const id = worker.runs()[0].id;
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(task).resolves.toMatchObject({ ok: false, output: expect.stringContaining("слишком долго") });
    expect(worker.terminate).toHaveBeenCalledOnce();
    const next = await warm();
    const resumed = runner.runPython("print(3)");
    await flush();
    oldHandler({ data: { type: "result", id, ok: true, output: "late" } } as MessageEvent<unknown>);
    next.emit({ type: "result", id: next.runs()[0].id, ok: true, output: "3" });
    await expect(resumed).resolves.toEqual({ ok: true, output: "3" });
  });

  it.each(["onerror", "onmessageerror"] as const)("rejects %s as infrastructure failure and resets the engine", async (event) => {
    const worker = await warm();
    const task = runner.runPython("print(1)");
    const failed = expect(task).rejects.toThrow("Повтори запуск");
    await flush();
    worker[event]?.();
    await failed;
    expect(worker.terminate).toHaveBeenCalledOnce();
    await warm();
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("bounds excessive output and terminates the printing interpreter", async () => {
    const worker = await warm();
    const task = runner.runPython("while True: print(1)");
    await flush();
    worker.emit({ type: "output-limit", id: worker.runs()[0].id, ok: true, output: "x".repeat(MAX_PRACTICE_OUTPUT + 20) });
    const result = await task;
    expect(result.ok).toBe(false);
    expect(result.output).toHaveLength(MAX_PRACTICE_OUTPUT);
    expect(worker.terminate).toHaveBeenCalledOnce();
    await warm();
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("does not turn malformed worker output into a learner mistake", async () => {
    const worker = await warm();
    const task = runner.runPython("print(1)");
    const failed = expect(task).rejects.toThrow("некорректный результат");
    await flush();
    worker.emit({ type: "result", id: worker.runs()[0].id, ok: true, output: null });
    await failed;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
