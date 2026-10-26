/* global importScripts, loadPyodide */

// A persistent interpreter lives off the UI thread. Each run gets fresh globals.
const MAX_OUTPUT = 10_000;
const OUTPUT_LIMIT = "Вывод программы слишком длинный. Проверь цикл и количество вызовов print.";
let engine;

function load() {
  if (!engine) {
    importScripts("/pyodide/pyodide.js");
    engine = loadPyodide({ indexURL: "/pyodide/" });
  }
  return engine;
}

async function execute(message) {
  const pyodide = await load();
  let output = "";
  let overflow = false;
  const record = () => {
    const decoder = new TextDecoder();
    return (buffer) => {
      if (overflow) return buffer.length;
      const text = decoder.decode(buffer, { stream: true });
      if (output.length + text.length > MAX_OUTPUT) {
        overflow = true;
        const suffix = "\n" + OUTPUT_LIMIT;
        output = (output + text).slice(0, MAX_OUTPUT - suffix.length) + suffix;
        // Termination is controlled by the page, outside the Python event loop.
        self.postMessage({ type: "output-limit", id: message.id, ok: false, output });
        return buffer.length;
      }
      output += text;
      return buffer.length;
    };
  };
  pyodide.setStdout({ write: record() });
  pyodide.setStderr({ write: record() });
  const globals = pyodide.toPy({ __name__: "__main__" });
  let result;
  let answer;
  try {
    result = await pyodide.runPythonAsync(message.code, { globals });
    answer = { type: "result", id: message.id, ok: true, output: output.replace(/\n$/, "") };
  } catch (error) {
    const gist = String(error?.message ?? error).trim().split("\n").filter((line) => line.trim()).pop() || "Ошибка выполнения Python";
    answer = { type: "result", id: message.id, ok: false, output: (output + (output.endsWith("\n") || !output ? "" : "\n") + gist).slice(-MAX_OUTPUT) };
  } finally {
    result?.destroy?.();
    globals.destroy();
  }
  if (!overflow) self.postMessage(answer);
}

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === "load") {
    Promise.resolve().then(load).then(() => self.postMessage({ type: "ready" }), () => self.postMessage({ type: "load-error" }));
  } else if (message?.type === "run" && Number.isInteger(message.id) && typeof message.code === "string") {
    execute(message).catch(() => self.postMessage({ type: "fatal" }));
  }
};
