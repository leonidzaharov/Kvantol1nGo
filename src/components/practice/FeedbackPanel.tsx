"use client";

import { CheckCircle, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PracticeFeedback } from "@/lib/practice-types";
import { cn } from "@/lib/utils";

type Props = {
  correct: boolean;
  feedback: PracticeFeedback;
  onContinue: () => void;
};

export function FeedbackPanel({ correct, feedback, onContinue }: Props) {
  const Icon = correct ? CheckCircle : Lightbulb;
  return (
    <section
      aria-label="Разбор ответа"
      className={cn("rounded-2xl border-2 p-5", correct
        ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50")}
    >
      <h3 tabIndex={-1} ref={(node) => node?.focus()} className="flex items-center gap-2 text-lg font-bold text-neutral-700 outline-none">
        <Icon aria-hidden="true" className="h-6 w-6 shrink-0" />
        {correct ? "Верно!" : "Пока не получилось"}
      </h3>
      <p className="mt-4 font-bold text-neutral-700">Правильный ответ</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-neutral-700">{feedback.answer}</p>
      <p className="mt-4 whitespace-pre-wrap break-words text-neutral-600">{feedback.explanation}</p>
      {!correct && <p className="mt-3 text-sm text-neutral-600">Этот навык ещё встретится в другом примере.</p>}
      <Button type="button" variant="secondary" className="mt-5 w-full sm:w-auto" onClick={onContinue}>
        Далее
      </Button>
    </section>
  );
}
