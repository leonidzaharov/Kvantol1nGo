"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Challenge } from "@/app/lesson/[id]/challenge";
import { CodeChallenge } from "@/app/lesson/[id]/code-challenge";
import { TextChallenge } from "@/app/lesson/[id]/text-challenge";
import { Button } from "@/components/ui/button";
import { matchingAnswerComplete } from "@/lib/matching-pairs";
import { practiceItemsValid } from "@/lib/practice-config";
import { MAX_PRACTICE_OUTPUT } from "@/lib/practice-types";
import type { RunResult } from "@/lib/code-runner";
import {
  advancePractice,
  beginPracticeCheck,
  createPracticeFlow,
  failPracticeCheck,
  receivePracticeCheck,
} from "@/lib/practice-flow";
import type {
  CheckPracticeAnswer,
  PracticeAnswer,
  PracticeCheckResult,
  PracticeItem,
  PracticeVariant,
} from "@/lib/practice-types";

import { FeedbackPanel } from "./FeedbackPanel";
import { MatchingQuestion } from "./MatchingQuestion";

type Props = {
  title: string;
  /** Include content revision and user identity; changing it discards local state. */
  sessionKey: string;
  items: readonly PracticeItem[];
  checkAnswer: CheckPracticeAnswer;
  /** Only a future trusted adapter may supply saved solutions. Not a reward gate. */
  initialSolvedIds?: readonly string[];
  /** The lesson wrapper confirms completion and offers bonuses here. */
  completion?: ReactNode;
};

export function PracticeRunner(props: Props) {
  if (!practiceItemsValid(props.items)) {
    return <p role="alert" className="rounded-xl bg-amber-50 p-5 text-neutral-700">Практика пока недоступна. Проверь состав заданий и варианты.</p>;
  }
  return <PracticeSession key={props.sessionKey} {...props} />;
}

function PracticeSession({ title, sessionKey, items, checkAnswer, initialSolvedIds, completion }: Props) {
  const [flow, setFlow] = useState(() => createPracticeFlow(items, initialSolvedIds));
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => pending.current?.abort(), []);

  const current = flow.queue[0];
  const item = items.find((candidate) => candidate.id === current?.itemId);
  const variant = item?.variants[current?.variantIndex ?? 0];

  async function check(answer: PracticeAnswer) {
    // A ref closes the interval before React has rendered the disabled button.
    if (!item || !variant || pending.current || flow.phase !== "answer" || error?.stale) return;
    const controller = new AbortController();
    pending.current = controller;
    const requestId = ++sequence.current;
    setError(null);
    setFlow((previous) => beginPracticeCheck(previous, requestId));
    try {
      const result = await checkAnswer({ itemId: item.id, variantId: variant.id, answer }, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind !== "checked") {
        setError(result.kind === "content-changed"
          ? { message: "Задания обновились. Открой практику заново, чтобы продолжить.", stale: true }
          : { message: "Не удалось проверить этот ответ. Проверь ввод и попробуй снова.", stale: false });
      }
      setFlow((previous) => receivePracticeCheck(previous, requestId, result));
    } catch {
      if (controller.signal.aborted) return;
      setError({ message: "Не удалось связаться с проверкой. Твой ответ сохранён на экране. Попробуй ещё раз.", stale: false });
      setFlow((previous) => failPracticeCheck(previous, requestId));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  return (
    <section aria-label="Учебная практика" className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-bold text-sky-700">Практика</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-700">{title}</h1>
        <p className="mt-3 text-sm text-neutral-600">Выполнено: {flow.solvedIds.length} из {items.length}</p>
        <progress aria-label="Решённые задания" value={flow.solvedIds.length} max={items.length} className="mt-2 h-3 w-full accent-green-600" />
      </header>
      {flow.phase === "finished" ? (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-6">
          <h2 tabIndex={-1} ref={(node) => node?.focus()} className="text-xl font-bold text-neutral-700 outline-none">Практика завершена!</h2>
          <p className="mt-3 text-neutral-600">Ты справился со всеми обязательными заданиями. Попробуй вспомнить главное правило без подсказки.</p>
          {completion}
        </div>
      ) : item && variant && current ? (
        <PracticeStep key={`${item.id}:${variant.id}:${current.attempts}`}
          item={item} variant={variant} repeat={current.attempts > 0}
          shuffleSeed={`${sessionKey}:${item.id}:${variant.id}`}
          checking={flow.phase === "checking"} result={flow.result} error={error?.message}
          stale={error?.stale ?? false} onCheck={check}
          onContinue={() => { setFlow((previous) => advancePractice(previous, item.variants.length)); setError(null); }} />
      ) : <p role="alert">Не удалось открыть задание. Открой практику заново.</p>}
    </section>
  );
}

type StepProps = {
  item: PracticeItem;
  variant: PracticeVariant;
  repeat: boolean;
  shuffleSeed: string;
  checking: boolean;
  result: Extract<PracticeCheckResult, { kind: "checked" }> | null;
  error?: string;
  stale: boolean;
  onCheck: (answer: PracticeAnswer) => Promise<void>;
  onContinue: () => void;
};

function PracticeStep({ item, variant, repeat, shuffleSeed, checking, result, error, stale, onCheck, onContinue }: StepProps) {
  const [answer, setAnswer] = useState<PracticeAnswer>(() => variant.type === "text"
    ? { type: "text", text: "" } : variant.type === "match"
      ? { type: "match", pairs: [] } : variant.type === "code"
        ? { type: "code", executionOk: false, output: "" } : { type: "choice", optionIndex: -1 });
  const [code, setCode] = useState(() => variant.type === "code" ? variant.starterCode : "");
  const [execution, setExecution] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const executing = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; };
  }, []);
  const locked = running || checking || result !== null || stale;
  const ready = variant.type === "code" ? code.trim().length > 0 : answer.type === "text" ? answer.text.trim().length > 0
    : answer.type === "choice" ? answer.optionIndex >= 0
      : variant.type === "match" && answer.type === "match" && matchingAnswerComplete(variant.left, variant.right, answer.pairs);

  async function submitCode() {
    if (variant.type !== "code" || locked || !ready || executing.current) return;
    executing.current = true;
    setRunning(true);
    setRunError(null);
    try {
      const { runCode } = await import("@/lib/code-runner");
      const execution = await runCode(variant.language, code);
      if (!mounted.current) return;
      const output = execution.output.slice(0, MAX_PRACTICE_OUTPUT);
      const executionOk = execution.ok && execution.output.length <= MAX_PRACTICE_OUTPUT;
      setExecution({ ok: executionOk, output });
      setRunning(false);
      await onCheck({ type: "code", executionOk, output });
    } catch {
      if (mounted.current) setRunError("Не удалось запустить программу. Код сохранён на экране. Попробуй ещё раз.");
    } finally {
      executing.current = false;
      if (mounted.current) setRunning(false);
    }
  }
  return (
    <div className="space-y-5">
      {repeat && <p className="text-sm font-bold text-sky-700">Другой пример на тот же навык</p>}
      {item.intro && <p className="whitespace-pre-wrap rounded-xl bg-sky-50 p-4 text-neutral-700">{item.intro}</p>}
      <h2 ref={heading} tabIndex={-1} className="whitespace-pre-wrap text-xl font-bold break-words text-neutral-700 outline-none">{variant.prompt}</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!locked && ready) {
          if (variant.type === "code") void submitCode();
          else void onCheck(answer);
        }
      }} className="space-y-5">
        {variant.type === "choice" && answer.type === "choice" && (
          <Challenge options={variant.options} selectedOption={answer.optionIndex < 0 ? undefined : answer.optionIndex}
            onSelect={(optionIndex) => setAnswer({ type: "choice", optionIndex })} status="none" disabled={locked} />
        )}
        {variant.type === "text" && answer.type === "text" && (
          <TextChallenge value={answer.text} onChange={(text) => setAnswer({ type: "text", text })} status="none" disabled={locked} />
        )}
        {variant.type === "match" && answer.type === "match" && (
          <MatchingQuestion left={variant.left} right={variant.right} pairs={answer.pairs}
            onChange={(pairs) => setAnswer({ type: "match", pairs })} shuffleSeed={shuffleSeed}
            disabled={locked} correctPairs={result?.feedback.correctPairs} />
        )}
        {variant.type === "code" && (
          <CodeChallenge code={code} onChange={(value) => { setCode(value); setRunError(null); }}
            language={variant.language} output={execution?.output ?? null} running={running}
            status={result ? result.correct ? "correct" : "wrong" : "none"}
            expectedOutput="" fails={0} disabled={locked} showHints={false}
            emptyOutputLabel="Программа завершилась без вывода." />
        )}
        {runError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-neutral-700">{runError}</p>}
        {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-neutral-700">{error}</p>}
        {!result && <Button type="submit" variant="secondary" size="lg" className="w-full sm:w-auto" disabled={locked || !ready}>
          {running ? "Выполняем..." : checking ? "Проверяем..." : variant.type === "code" ? "Запустить и проверить" : "Проверить"}
        </Button>}
      </form>
      {result && <FeedbackPanel correct={result.correct} feedback={result.feedback} onContinue={onContinue} />}
    </div>
  );
}
