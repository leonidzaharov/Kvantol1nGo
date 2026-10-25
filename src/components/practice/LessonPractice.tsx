"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { ResultCard } from "@/app/lesson/[id]/result-card";
import { AchievementToastStack } from "@/components/AchievementToast";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { completeLesson, saveTheoryStep, type CompleteLessonResult } from "@/lib/actions/gamification";
import { checkPracticeAnswer, previewPracticeAnswer } from "@/lib/actions/practice";
import type { SafePracticeContent } from "@/lib/practice-content";
import type { PracticeAttempt } from "@/lib/practice-types";
import { splitTheoryIntoSections } from "@/lib/theory-sections";

import { PracticeRunner } from "./PracticeRunner";

type Props = {
  lessonId: number;
  title: string;
  revision: string;
  sessionKey: string;
  content: SafePracticeContent;
  initialSolvedIds?: string[];
  initialTheoryStep?: number;
  previewMode?: boolean;
};

export function LessonPractice(props: Props) {
  return <LessonPracticeSession key={`${props.sessionKey}:${props.revision}`} {...props} />;
}

function LessonPracticeSession({ lessonId, title, revision, sessionKey, content, initialSolvedIds = [], initialTheoryStep = 0, previewMode = false }: Props) {
  const sections = splitTheoryIntoSections(content.theory);
  const [theoryIndex, setTheoryIndex] = useState(() => Math.max(0, Math.min(initialTheoryStep, sections.length)));
  const [phase, setPhase] = useState<"theory" | "core" | "result" | "bonus">(() =>
    sections.length > 0 && initialTheoryStep < sections.length && initialSolvedIds.length === 0 ? "theory" : "core");
  const [result, setResult] = useState<CompleteLessonResult | null>(null);
  const [toasts, setToasts] = useState<CompleteLessonResult["unlockedAchievements"]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const section = sections[theoryIndex];

  async function continueTheory() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const next = theoryIndex + 1;
    try {
      if (!previewMode) await saveTheoryStep(lessonId, next);
      setTheoryIndex(next);
      if (next >= sections.length) setPhase("core");
    } catch {
      setError("Не удалось сохранить место в уроке. Попробуй ещё раз.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function finishLesson() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (!previewMode) {
        const completed = await completeLesson(lessonId, revision);
        setResult(completed);
        setToasts(completed.unlockedAchievements);
      }
      setPhase("result");
    } catch {
      setError("Не удалось подтвердить завершение. Решения сохранены. Попробуй ещё раз; если урок обновился, обнови страницу.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function check(attempt: PracticeAttempt, signal: AbortSignal, part: "core" | "bonus") {
    const action = previewMode ? previewPracticeAnswer : checkPracticeAnswer;
    const checked = await action({ lessonId, revision, section: part, ...attempt });
    // Server Actions cannot accept an AbortSignal. Ignore a late reply locally.
    if (signal.aborted) throw new DOMException("Practice closed", "AbortError");
    return checked;
  }

  const errorMessage = error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-neutral-700">{error}</p>;

  return (
    <div className="min-h-screen bg-white pb-8">
      <AchievementToastStack achievements={toasts} onDismiss={(id) => setToasts((old) => old.filter((toast) => toast.id !== id))} />
      {phase === "theory" && section ? (
        <section className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <h1 className="text-2xl font-bold text-neutral-700">{title}</h1>
          <p className="text-sm text-neutral-600">Объяснение {theoryIndex + 1} из {sections.length}</p>
          <div key={theoryIndex}><Markdown>{section.markdown}</Markdown></div>
          {errorMessage}
          <Button type="button" variant="secondary" disabled={pending} onClick={continueTheory}>
            {pending ? "Сохраняем..." : theoryIndex + 1 >= sections.length ? "К практике" : "Далее"}
          </Button>
        </section>
      ) : phase === "core" ? (
        <PracticeRunner title={title} sessionKey={`${sessionKey}:${revision}:core`} items={content.questions}
          initialSolvedIds={initialSolvedIds} checkAnswer={(attempt, signal) => check(attempt, signal, "core")}
          completion={<>
            {errorMessage}
            <Button type="button" className="mt-5" variant="secondary" disabled={pending} onClick={finishLesson}>
              {pending ? "Подтверждаем..." : previewMode ? "Посмотреть итог" : "Завершить урок"}
            </Button>
          </>} />
      ) : phase === "bonus" ? (
        <>
          <div className="mx-auto flex max-w-2xl justify-end px-4 pt-4">
            <Button type="button" variant="ghost" onClick={() => setPhase("result")}>К итогам урока</Button>
          </div>
          <PracticeRunner title="Дополнительная практика" sessionKey={`${sessionKey}:${revision}:bonus`}
            items={content.bonusQuestions} checkAnswer={(attempt, signal) => check(attempt, signal, "bonus")}
            completion={<Button type="button" className="mt-5" variant="secondary" onClick={() => setPhase("result")}>К итогам урока</Button>} />
        </>
      ) : (
        <section className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
          <h1 tabIndex={-1} ref={(node) => node?.focus()} className="text-2xl font-bold text-neutral-700 outline-none">
            {previewMode ? "Предпросмотр завершён" : result?.firstCompletion ? "Урок пройден!" : "Повторение завершено!"}
          </h1>
          {result && <div className="grid grid-cols-2 gap-4"><ResultCard variant="points" value={result.gainedXp} /><ResultCard variant="coins" value={result.gainedCoins} /></div>}
          <p className="text-neutral-600">Попробуй объяснить главное правило своими словами. На следующем занятии проверь себя на новом примере.</p>
          {content.bonusQuestions.length > 0 && <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-5">
            <p className="font-bold text-neutral-700">Хочешь попробовать ещё?</p>
            <p className="mt-2 text-sm text-neutral-600">Задания со звёздочкой необязательны. Основная часть уже завершена.</p>
            <Button type="button" variant="primary" className="mt-4" onClick={() => setPhase("bonus")}>Задания со звёздочкой</Button>
          </div>}
          <Button variant="secondary" asChild><Link href={previewMode ? `/admin/lessons/${lessonId}` : "/learn"}>{previewMode ? "К редактору" : "К урокам"}</Link></Button>
        </section>
      )}
    </div>
  );
}
