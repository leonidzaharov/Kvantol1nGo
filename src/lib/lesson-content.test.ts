import { describe, expect, it } from "vitest";

import {
  normalizeLessonImages,
  normalizeTheoryHtml,
  parseLessonContent,
  sanitizeLessonContent,
} from "./lesson-content";

describe("normalizeTheoryHtml", () => {
  it("раскрывает figure/figcaption в картинку с подписью", () => {
    const html =
      '<div class="shots">\n' +
      '<figure><img src="assets/image1.jpeg" alt="Скриншот: image1.jpeg" loading="lazy"><figcaption>image1.jpeg</figcaption></figure>\n' +
      '<figure><img src="assets/image2.png" alt="Скриншот: image2.png" loading="lazy"><figcaption>image2.png</figcaption></figure>\n' +
      "</div>";
    expect(normalizeTheoryHtml(html)).toBe(
      "![Скриншот: image1.jpeg](assets/image1.jpeg)\n\n![Скриншот: image2.png](assets/image2.png)",
    );
  });

  it("превращает блок факта с заголовком и mark в жёлтый callout", () => {
    const html =
      '<div class="fact"><h2>🟨 🌍 Сцена 480 × 360.</h2><p><mark>Фон и костюм — разные вещи.</mark></p></div>';
    expect(normalizeTheoryHtml(html)).toBe(
      "> [!важно] **🌍 Сцена 480 × 360.**\n>\n> ==Фон и костюм — разные вещи.==",
    );
  });

  it("инлайновый mark становится ==подсветкой==, остальные теги снимаются", () => {
    expect(
      normalizeTheoryHtml("<mark>**Цель**</mark> и <span>текст</span><br>дальше"),
    ).toBe("==**Цель**== и текст\nдальше");
  });

  it("не трогает чистый markdown и код", () => {
    const md = "# Заголовок\n\n```html\n<div class=\"x\"><img src=\"a.png\"></div>\n```\n\nТекст `<b>` готов.";
    expect(normalizeTheoryHtml(md)).toBe(md);
  });

  it("применяется при разборе контента из БД вместе с картинками", () => {
    const parsed = parseLessonContent(
      JSON.stringify({
        theory: '<figure><img src="/media/q.webp"><figcaption>q</figcaption></figure>',
        questions: [],
      }),
    );
    expect(parsed.theory).toBe("![](/media/q.webp)");
  });
});

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
  it("поле question из внешнего JSON принимается как prompt", () => {
    const parsed = parseLessonContent(
      JSON.stringify({
        questions: [
          {
            type: "choice",
            question: "Для чего нужен фон?",
            options: ["Место действия", "Звук"],
            correctIndex: 0,
          },
        ],
      }),
    );
    expect(parsed.questions[0]?.prompt).toBe("Для чего нужен фон?");
    expect(parsed.questions[0]).not.toHaveProperty("question");
  });

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
