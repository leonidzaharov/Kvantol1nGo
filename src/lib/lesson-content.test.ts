import { describe, expect, it } from "vitest";

import {
  normalizeLessonImages,
  parseLessonContent,
  sanitizeLessonContent,
} from "./lesson-content";

describe("normalizeLessonImages", () => {
  it("превращает HTML-картинку редактора в markdown без размеров", () => {
    expect(
      normalizeLessonImages(
        'Текст\n<img height="100" width="148" src="/media/abc.webp" />\nЕщё',
      ),
    ).toBe("Текст\n![](/media/abc.webp)\nЕщё");
  });

  it("сохраняет alt и переносит одинарные кавычки", () => {
    expect(
      normalizeLessonImages("<img alt='Схема' src='/media/x.png'>"),
    ).toBe("![Схема](/media/x.png)");
  });

  it("не трогает обычный markdown и выкидывает картинку без src", () => {
    expect(normalizeLessonImages("![a](/media/a.png) и <img width=5>")).toBe(
      "![a](/media/a.png) и ",
    );
  });

  it("применяется при разборе контента из БД", () => {
    const parsed = parseLessonContent(
      JSON.stringify({ theory: '<img src="/media/q.webp">', questions: [] }),
    );
    expect(parsed.theory).toBe("![](/media/q.webp)");
  });
});

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
