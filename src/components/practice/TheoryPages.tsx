"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import type { TheorySection } from "@/lib/theory-sections";

type Props = {
  title: string;
  sections: TheorySection[];
  index: number;
  onPageChange: (index: number) => void;
  onContinue: () => void;
  pending?: boolean;
  error?: ReactNode;
  onReturnToPractice?: () => void;
};

/** The same material pages are used before practice and when returning to them. */
export function TheoryPages({ title, sections, index, onPageChange, onContinue, pending = false, error, onReturnToPractice }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [index]);
  const section = sections[index];
  if (!section) return null;
  return (
    <section aria-label="Материал урока" className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <h1 ref={heading} tabIndex={-1} className="scroll-mt-4 text-2xl font-bold text-neutral-700 outline-none">{title}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">Объяснение {index + 1} из {sections.length}</p>
        {onReturnToPractice && <Button type="button" variant="secondaryOutline" size="sm" onClick={onReturnToPractice}>Вернуться к практике</Button>}
      </div>
      <div key={index}><Markdown>{section.markdown}</Markdown></div>
      {error}
      <nav aria-label="Страницы материала" className="sticky bottom-0 flex justify-between gap-3 border-t-2 border-neutral-100 bg-white py-4">
        <Button type="button" variant="default" disabled={pending || index === 0} onClick={() => onPageChange(index - 1)}>Назад</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onContinue}>
          {pending ? "Сохраняем..." : index + 1 < sections.length ? "Далее" : onReturnToPractice ? "Продолжить практику" : "К практике"}
        </Button>
      </nav>
    </section>
  );
}
