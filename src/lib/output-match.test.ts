import { describe, expect, it } from "vitest";

import { diffHint, normalizeOutput, outputsMatch } from "./output-match";

describe("outputsMatch", () => {
  it("точное совпадение проходит", () => {
    expect(outputsMatch("Привет, мир!", "Привет, мир!")).toBe(true);
  });

  it("прощает лишние пробелы внутри и по краям строки", () => {
    expect(outputsMatch("  Привет,   мир!  ", "Привет, мир!")).toBe(true);
  });

  it("прощает разные виды кавычек", () => {
    expect(outputsMatch("Скажи 'привет'", 'Скажи "привет"')).toBe(true);
    expect(outputsMatch("Скажи «привет»", "Скажи 'привет'")).toBe(true);
  });

  it("прощает ё/е и типографские тире", () => {
    expect(outputsMatch("зелёный — цвет", "зеленый - цвет")).toBe(true);
  });

  it("прощает пустые строки в начале и конце", () => {
    expect(outputsMatch("\n\nответ: 4\n", "ответ: 4")).toBe(true);
  });

  it("прощает Windows-переводы строк", () => {
    expect(outputsMatch("a\r\nb", "a\nb")).toBe(true);
  });

  it("НЕ прощает другой регистр", () => {
    expect(outputsMatch("привет", "Привет")).toBe(false);
  });

  it("НЕ прощает другие слова и цифры", () => {
    expect(outputsMatch("ответ: 5", "ответ: 4")).toBe(false);
  });

  it("НЕ прощает недостающую строку", () => {
    expect(outputsMatch("a\nb", "a\nb\nc")).toBe(false);
  });
});

describe("normalizeOutput", () => {
  it("сохраняет смысловые пустые строки внутри текста", () => {
    expect(normalizeOutput("a\n\nb")).toBe("a\n\nb");
  });
});

describe("diffHint", () => {
  it("null для совпадающих текстов", () => {
    expect(diffHint("Привет", "  Привет ")).toBeNull();
  });

  it("сообщает о разном числе строк", () => {
    expect(diffHint("a", "a\nb\nc")).toBe("В выводе 1 строка, а ожидается 3.");
  });

  it("называет номер несовпадающей строки", () => {
    expect(diffHint("a\nX\nc", "a\nb\nc")).toBe(
      "Не совпадает строка 2 — сверь её с заданием посимвольно.",
    );
  });

  it("для однострочного вывода не называет номер строки", () => {
    expect(diffHint("привет", "Привет")).toBe(
      "Текст вывода не совпадает с ожидаемым — сверь каждый символ.",
    );
  });
});
