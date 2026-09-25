import { describe, expect, it } from "vitest";

import {
  parseLessonContent,
  sanitizeLessonContent,
} from "./lesson-content";

describe("lesson content v3", () => {
  it("старый урок без bonusQuestions остаётся совместимым", () => {
    const parsed = parseLessonContent(
      JSON.stringify({
        theory: "Теория",
        questions: [
          {
            prompt: "2 + 2?",
            options: ["3", "4"],
            correctIndex: 1,
          },
        ],
      }),
    );

    expect(parsed.questions).toHaveLength(1);
    expect(parsed.bonusQuestions).toEqual([]);
  });

  it("вырезает ответы и решения из основной и бонусной частей", () => {
    const parsed = parseLessonContent(
      JSON.stringify({
        questions: [
          {
            type: "choice",
            prompt: "Основной вопрос",
            options: ["Да", "Нет"],
            correctIndex: 0,
          },
          {
            type: "text",
            prompt: "Свободный ответ",
            correctAnswer: "Я программирую.",
          },
        ],
        bonusQuestions: [
          {
            type: "code",
            prompt: "Дополнительный код",
            language: "python",
            starterCode: "",
            expectedOutput: "42",
            referenceSolution: "print(42)",
          },
        ],
      }),
    );

    const safe = sanitizeLessonContent(parsed);
    expect(JSON.stringify(safe)).not.toContain("correctIndex");
    expect(JSON.stringify(safe)).not.toContain("correctAnswer");
    expect(JSON.stringify(safe)).not.toContain("referenceSolution");
    expect(safe.questions).toHaveLength(2);
    expect(safe.bonusQuestions).toHaveLength(1);
  });
});
