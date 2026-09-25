import type {
  ReviewCodeLanguage,
  ReviewResponseType,
} from "@/generated/prisma";
import { REVIEW_CODE_LANGUAGE_LABELS } from "@/lib/review-labels";

import { LazyCodeEditor } from "./lazy-code-editor";

type ResponseViewProps = {
  responseType: ReviewResponseType;
  codeLanguage: ReviewCodeLanguage | null;
  content: string;
  codeAriaLabel?: string;
};

export function ResponseView({
  responseType,
  codeLanguage,
  content,
  codeAriaLabel = "Код ответа",
}: ResponseViewProps) {
  if (responseType === "LINK") {
    return (
      <a
        href={content}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-bold text-sky-600 underline decoration-2 underline-offset-4 hover:text-sky-700"
      >
        {content}
      </a>
    );
  }

  if (responseType === "CODE") {
    const language = codeLanguage ?? "OTHER";
    return (
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
          {REVIEW_CODE_LANGUAGE_LABELS[language]}
        </p>
        <LazyCodeEditor
          language={language}
          initialValue={content}
          readOnly
          ariaLabel={codeAriaLabel}
        />
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-4 leading-7 text-neutral-700">
      {content}
    </p>
  );
}
