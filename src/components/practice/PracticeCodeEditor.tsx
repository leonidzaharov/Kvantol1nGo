"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { StoredPracticeVariant } from "@/lib/practice-content";
import { MAX_PRACTICE_OUTPUT } from "@/lib/practice-types";

type CodeVariant = Extract<StoredPracticeVariant, { type: "code" }>;
type Execution = { source: string; ok: boolean; output: string };

export function PracticeCodeEditor({ variant, onChange, inputClass }: {
  variant: CodeVariant;
  onChange: (variant: StoredPracticeVariant) => void;
  inputClass: string;
}) {
  const latest = useRef({ variant, onChange });
  const mounted = useRef(true);
  const busy = useRef(false);
  const generation = useRef(0);
  const [running, setRunning] = useState(false);
  const [execution, setExecution] = useState<Execution | null>(null);
  const source = JSON.stringify([variant.language, variant.referenceSolution]);
  useLayoutEffect(() => {
    const previous = latest.current.variant;
    if (previous.id !== variant.id || previous.language !== variant.language ||
        previous.referenceSolution !== variant.referenceSolution || previous.expectedOutput !== variant.expectedOutput) {
      generation.current++;
    }
    latest.current = { variant, onChange };
  }, [variant, onChange]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function update(change: Partial<CodeVariant>) {
    if ("language" in change || "referenceSolution" in change || "expectedOutput" in change) {
      generation.current++;
      setExecution(null);
    }
    latest.current.onChange({ ...latest.current.variant, ...change });
  }

  async function checkReference() {
    const snapshot = latest.current.variant;
    if (busy.current || !snapshot.referenceSolution.trim()) return;
    busy.current = true;
    const request = ++generation.current;
    const checkedSource = JSON.stringify([snapshot.language, snapshot.referenceSolution]);
    const current = () => mounted.current && request === generation.current &&
      latest.current.variant.id === snapshot.id &&
      JSON.stringify([latest.current.variant.language, latest.current.variant.referenceSolution]) === checkedSource;
    setRunning(true);
    setExecution(null);
    try {
      // Importing on demand keeps Python out of the editor's initial loading path.
      const { runCode } = await import("@/lib/code-runner");
      const result = await runCode(snapshot.language, snapshot.referenceSolution);
      if (!current()) return;
      if (result.ok && result.output.length > 3000) {
        setExecution({ source: checkedSource, ok: false, output: "Вывод длиннее 3000 символов. Сократи эталонное решение перед сохранением." });
        return;
      }
      setExecution({ source: checkedSource, ok: result.ok, output: result.output.slice(0, MAX_PRACTICE_OUTPUT) });
      if (result.ok) latest.current.onChange({ ...latest.current.variant, expectedOutput: result.output });
    } catch {
      if (current()) setExecution({ source: checkedSource, ok: false, output: "Не удалось запустить эталон. Проверь соединение и попробуй снова." });
    } finally {
      busy.current = false;
      if (mounted.current) setRunning(false);
    }
  }

  const visibleExecution = execution?.source === source ? execution : null;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Язык кода
        <select value={variant.language} className={inputClass} onChange={(event) => update({ language: event.target.value as CodeVariant["language"] })}>
          <option value="python">Python</option><option value="javascript">JavaScript</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Стартовый код
        <textarea rows={4} maxLength={10000} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={variant.starterCode} className={inputClass + " font-mono"} onChange={(event) => update({ starterCode: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Эталонное решение
        <textarea required rows={5} maxLength={10000} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={variant.referenceSolution} className={inputClass + " font-mono"} onChange={(event) => update({ referenceSolution: event.target.value })} />
      </label>
      <p className="text-sm text-neutral-500">Правильный код и объяснение появятся у ученика после попытки. Проверка эталона заполнит ожидаемый вывод. Python загружается при первом запуске.</p>
      <Button type="button" variant="secondaryOutline" className="self-start" disabled={running || !variant.referenceSolution.trim()} onClick={checkReference}>
        {running ? "Запускаем эталон..." : "Проверить эталон"}
      </Button>
      {visibleExecution && <div role={visibleExecution.ok ? "status" : "alert"} className={"rounded-xl p-3 text-sm " + (visibleExecution.ok ? "bg-green-50 text-neutral-700" : "bg-amber-50 text-neutral-700")}>
        <p className="mb-1 font-bold">{visibleExecution.ok ? "Эталон выполнен, ожидаемый вывод обновлён" : "Ожидаемый вывод сохранён без изменений"}</p>
        <pre className="whitespace-pre-wrap break-words font-mono">{visibleExecution.output || "(пустой вывод)"}</pre>
      </div>}
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Ожидаемый вывод программы
        <textarea rows={3} maxLength={3000} spellCheck={false} value={variant.expectedOutput} className={inputClass + " font-mono"} onChange={(event) => update({ expectedOutput: event.target.value })} />
      </label>
    </div>
  );
}
