import { describe, expect, it } from "vitest";

import { splitTheoryIntoSections } from "./theory-sections";

describe("splitTheoryIntoSections", () => {
  it("делит длинный Scratch-урок по H1", () => {
    const result = splitTheoryIntoSections(
      "# Введение\nТекст\n\n# 1. Фон\nШаг один\n\n# 2. Спрайт\nШаг два",
    );

    expect(result).toHaveLength(3);
    expect(result.map((section) => section.title)).toEqual([
      "Введение",
      "1. Фон",
      "2. Спрайт",
    ]);
    expect(result[1]?.markdown).toContain("Шаг один");
  });

  it("использует H2 для обычного урока с единственным H1", () => {
    const result = splitTheoryIntoSections(
      "# Переменные\nВступление\n\n## Что это\nТекст\n\n## Пример\nКод",
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe("Что это");
    expect(result[0]?.markdown).toContain("# Переменные");
    expect(result[0]?.markdown).toContain("Вступление");
    expect(result[1]?.title).toBe("Пример");
  });

  it("не принимает комментарии внутри блока кода за заголовки", () => {
    const result = splitTheoryIntoSections(
      "# Python\n```python\n# комментарий\nprint('Привет')\n```",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.markdown).toContain("# комментарий");
  });

  it("оставляет короткую теорию одним экраном", () => {
    const result = splitTheoryIntoSections("Прочитай текст и повтори пример.");

    expect(result).toEqual([
      {
        title: "Теория",
        markdown: "Прочитай текст и повтори пример.",
      },
    ]);
  });

  it("возвращает пустой список для пустой теории", () => {
    expect(splitTheoryIntoSections("  \n ")).toEqual([]);
  });
});
