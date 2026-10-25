"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Challenge } from "@/app/lesson/[id]/challenge";
import { TextChallenge } from "@/app/lesson/[id]/text-challenge";
import { Button } from "@/components/ui/button";
import { matchingAnswerComplete } from "@/lib/matching-pairs";
import { practiceItemsValid } from "@/lib/practice-config";
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
  onCheck: (answer: PracticeAnswer) => void;
  onContinue: () => void;
};

function PracticeStep({ item, variant, repeat, shuffleSeed, checking, result, error, stale, onCheck, onContinue }: StepProps) {
  const [answer, setAnswer] = useState<PracticeAnswer>(() => variant.type === "text"
    ? { type: "text", text: "" } : variant.type === "match"
      ? { type: "match", pairs: [] } : { type: "choice", optionIndex: -1 });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const locked = checking || result !== null || stale;
  const ready = answer.type === "text" ? answer.text.trim().length > 0
    : answer.type === "choice" ? answer.optionIndex >= 0
      : variant.type === "match" && matchingAnswerComplete(variant.left, variant.right, answer.pairs);
  return (
    <div className="space-y-5">
      {repeat && <p className="text-sm font-bold text-sky-700">Другой пример на тот же навык</p>}
      {item.intro && <p className="whitespace-pre-wrap rounded-xl bg-sky-50 p-4 text-neutral-700">{item.intro}</p>}
      <h2 ref={heading} tabIndex={-1} className="whitespace-pre-wrap text-xl font-bold break-words text-neutral-700 outline-none">{variant.prompt}</h2>
      <form onSubmit={(event) => { event.preventDefault(); if (!locked && ready) onCheck(answer); }} className="space-y-5">
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
        {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-neutral-700">{error}</p>}
        {!result && <Button type="submit" variant="secondary" size="lg" className="w-full sm:w-auto" disabled={locked || !ready}>{checking ? "Проверяем..." : "Проверить"}</Button>}
      </form>
      {result && <FeedbackPanel correct={result.correct} feedback={result.feedback} onContinue={onContinue} />}
    </div>
  );
}
