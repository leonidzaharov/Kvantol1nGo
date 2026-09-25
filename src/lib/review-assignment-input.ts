import { z } from "zod";

import type {
  ReviewCodeLanguage,
  ReviewResponseType,
  ReviewSubmissionStatus,
} from "@/generated/prisma";

const AssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(10_000),
    responseType: z.enum(["TEXT", "LINK", "CODE"]),
    codeLanguage: z
      .enum(["PYTHON", "JAVASCRIPT", "HTML", "CSS", "OTHER"])
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.responseType === "CODE" && value.codeLanguage === null) {
      ctx.addIssue({
        code: "custom",
        path: ["codeLanguage"],
        message: "Для кода выберите язык",
      });
    }
    if (value.responseType !== "CODE" && value.codeLanguage !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["codeLanguage"],
        message: "Язык допустим только для ответа с кодом",
      });
    }
  });

export type ReviewAssignmentData = {
  title: string;
  instructions: string;
  responseType: ReviewResponseType;
  codeLanguage: ReviewCodeLanguage | null;
};

export type ReviewParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseReviewAssignmentInput(raw: {
  title: unknown;
  instructions: unknown;
  responseType: unknown;
  codeLanguage: unknown;
}): ReviewParseResult<ReviewAssignmentData> {
  const rawLanguage = String(raw.codeLanguage ?? "").trim();
  const parsed = AssignmentSchema.safeParse({
    ...raw,
    codeLanguage: rawLanguage === "" ? null : rawLanguage,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Проверьте поля: нужен заголовок до 120 символов, инструкция и корректный формат ответа.",
    };
  }

  return { ok: true, data: parsed.data };
}

export function parseReviewResponse(
  responseType: ReviewResponseType,
  rawContent: unknown,
): ReviewParseResult<string> {
  const content = String(rawContent ?? "").trim();

  if (responseType === "LINK") {
    if (content.length === 0 || content.length > 2_000) {
      return { ok: false, error: "Вставьте одну ссылку длиной до 2000 символов." };
    }

    let url: URL;
    try {
      url = new URL(content);
    } catch {
      return {
        ok: false,
        error: "Нужна полная безопасная ссылка, начинающаяся с https://",
      };
    }
    if (url.protocol !== "https:") {
      return {
        ok: false,
        error: "Нужна полная безопасная ссылка, начинающаяся с https://",
      };
    }
    return { ok: true, data: url.toString() };
  }

  const maxLength = responseType === "CODE" ? 50_000 : 10_000;
  if (content.length === 0 || content.length > maxLength) {
    return {
      ok: false,
      error:
        responseType === "CODE"
          ? "Код не должен быть пустым или длиннее 50 000 символов."
          : "Ответ не должен быть пустым или длиннее 10 000 символов.",
    };
  }

  return { ok: true, data: content };
}

const ReviewSchema = z.object({
  decision: z.enum(["REVISION_REQUESTED", "ACCEPTED"]),
  mentorComment: z.string().trim().max(5_000),
});

export type ReviewDecisionData = {
  decision: Extract<
    ReviewSubmissionStatus,
    "REVISION_REQUESTED" | "ACCEPTED"
  >;
  mentorComment: string | null;
};

export function parseReviewDecision(raw: {
  decision: unknown;
  mentorComment: unknown;
}): ReviewParseResult<ReviewDecisionData> {
  const parsed = ReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Комментарий не должен быть длиннее 5000 символов.",
    };
  }

  if (
    parsed.data.decision === "REVISION_REQUESTED" &&
    parsed.data.mentorComment.length === 0
  ) {
    return {
      ok: false,
      error: "При возврате работы напишите, что именно нужно исправить.",
    };
  }

  return {
    ok: true,
    data: {
      decision: parsed.data.decision,
      mentorComment: parsed.data.mentorComment || null,
    },
  };
}
