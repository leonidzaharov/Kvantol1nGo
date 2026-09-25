"use client";

import dynamic from "next/dynamic";

import type { ReviewCodeLanguage } from "@/generated/prisma";

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[280px] animate-pulse rounded-xl border-2 border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-400">
        Загружаю подсветку кода…
      </div>
    ),
  },
);

type LazyCodeEditorProps = {
  language: ReviewCodeLanguage;
  initialValue?: string;
  readOnly?: boolean;
  name?: string;
  ariaLabel: string;
};

export function LazyCodeEditor({
  language,
  initialValue = "",
  readOnly,
  name,
  ariaLabel,
}: LazyCodeEditorProps) {
  return (
    <CodeEditor
      language={language}
      initialValue={initialValue}
      readOnly={readOnly}
      name={name}
      ariaLabel={ariaLabel}
    />
  );
}
