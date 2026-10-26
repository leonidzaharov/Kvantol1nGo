import { describe, expect, it } from "vitest";

import { isPracticeContent, parseLessonDocument, parseLessonMarkdown, parseLessonQuestionsImport } from "./lesson-document";

const classicQuestion = { prompt: "Сколько шагов?", options: ["2", "3"], correctIndex: 0 };
const practice = {
  format: "practice-v1", questions: [{ id: "steps", variants: [
    { id: "a", type: "choice", ...classicQuestion, explanation: "Два шага." },
    { id: "b", type: "text", prompt: "Назови число", correctAnswer: "2", explanation: "Получилось два." },
  ] }],
};
const codePractice = {
  format: "practice-v1", theory: "# Код", questions: [{ id: "loops", variants: ["first", "second"].map((id) => ({
    id, type: "code", language: "python", starterCode: 'for student in ["Мира", "Тео"]:\n    print(students)',
    expectedOutput: "Мира\nТео", referenceSolution: 'for student in ["Мира", "Тео"]:\n    print(student)',
    prompt: "Исправь имя переменной внутри цикла.", explanation: "student получает текущее имя на каждом шаге.",
  })) }], bonusQuestions: [],
};

describe("parseLessonDocument", () => {
  it("retains classic missing-type questions and code defaults", () => {
    const parsed = parseLessonDocument(JSON.stringify({ questions: [classicQuestion, { type: "code", prompt: "Печатай", expectedOutput: "ok" }] }));
    expect(parsed?.questions).toHaveLength(2);
    expect(parsed?.questions[1]).toMatchObject({ type: "code", language: "python", starterCode: "" });
    expect(parsed && isPracticeContent(parsed)).toBe(false);
  });

  it("reads stored code practice without downgrading it to classic", () => {
    const parsed = parseLessonDocument(JSON.stringify(codePractice));
    expect(parsed && isPracticeContent(parsed)).toBe(true);
    expect(parsed).toEqual(codePractice);
  });

  it("recognises practice without downgrading unknown or damaged versions", () => {
    const parsed = parseLessonDocument(JSON.stringify(practice));
    expect(parsed && isPracticeContent(parsed)).toBe(true);
    for (const value of [{ ...practice, format: "practice-v2" }, { ...practice, questions: [] }, { ...practice, questions: [{ id: "broken" }] }, {}, [], { questions: [{ type: "match" }] }]) {
      expect(parseLessonDocument(JSON.stringify(value))).toBeNull();
    }
    expect(parseLessonDocument("{broken")).toBeNull();
  });

  it("rejects oversized practice documents even if extra JSON whitespace caused the size", () => {
    expect(parseLessonDocument(" ".repeat(256 * 1024) + JSON.stringify(practice))).toBeNull();
  });

  it("does not render a reserved command accidentally saved directly inside JSON theory", () => {
    const theory = `\`\`\`kvantolingo\n${JSON.stringify([classicQuestion])}\n\`\`\``;
    expect(parseLessonDocument(JSON.stringify({ questions: [classicQuestion], theory }))).toBeNull();
    expect(parseLessonDocument(JSON.stringify({ ...practice, theory }))).toBeNull();
  });
});

describe("parseLessonQuestionsImport", () => {
  it("accepts legacy arrays, aliases and objects with bonus questions", () => {
    expect(parseLessonQuestionsImport([{ options: ["2", "3"], correctIndex: 0, question: "Сколько шагов?" }])).toMatchObject({ format: "classic", questions: [{ prompt: "Сколько шагов?" }], bonusQuestions: [] });
    expect(parseLessonQuestionsImport({ questions: [classicQuestion], bonusQuestions: [{ type: "text", prompt: "Число", correctAnswer: "2" }] })).toMatchObject({ format: "classic", bonusQuestions: [{ type: "text" }] });
  });

  it("preserves practice variants, explanations and IDs", () => {
    expect(parseLessonQuestionsImport(practice)).toEqual({ ...practice, bonusQuestions: [] });
  });

  it("roundtrips code programs, empty expected output and teaching feedback through JSON", () => {
    const withSilentVariant = structuredClone(codePractice);
    withSilentVariant.questions[0].variants[1].expectedOutput = "";
    withSilentVariant.questions[0].variants[1].referenceSolution = "pass";
    const imported = parseLessonQuestionsImport(JSON.parse(JSON.stringify(withSilentVariant)));
    expect(imported).toEqual({ format: "practice-v1", questions: withSilentVariant.questions, bonusQuestions: [] });
  });

  it("fails explicitly instead of stripping versioned fields or clearing questions", () => {
    for (const input of [{ ...practice, format: "future" }, { ...practice, questions: [classicQuestion] }, null, {}, []]) {
      expect(() => parseLessonQuestionsImport(input)).toThrow();
    }
  });
});

describe("parseLessonMarkdown", () => {
  it("keeps plain Markdown byte-for-byte including code, tables, callouts and images", () => {
    const plain = "# Урок\r\n\r\n> [!важно]\r\n> ==Повторяем==\r\n\r\n| a | b |\r\n| - | - |\r\n\r\n![Картинка](images/a.png)\r\n\r\n```python\r\nprint(2)\r\n```\r\n";
    expect(parseLessonMarkdown(plain)).toEqual({ theory: plain, questionImport: null });
  });

  it("extracts the optional command and removes private solutions from rendered theory", () => {
    const parsed = parseLessonMarkdown(`# Суммы\n\n![Карточка](images/a.png)\n\n\`\`\`kvantolingo\n${JSON.stringify(practice)}\n\`\`\`\n\n## Подсказка\nПроверь число.`);
    expect(parsed.questionImport?.format).toBe("practice-v1");
    expect(parsed.theory).toContain("![Карточка](images/a.png)");
    expect(parsed.theory).toContain("## Подсказка");
    for (const secret of ["correctAnswer", "correctIndex", "explanation", "kvantolingo"]) expect(parsed.theory).not.toContain(secret);
  });

  it("extracts code variants and preserves their source while keeping solutions out of theory", () => {
    const md = `# Циклы\n\n\`\`\`kvantolingo\n${JSON.stringify(codePractice)}\n\`\`\`\n\nТеперь попробуй.`;
    const imported = parseLessonMarkdown(md);
    expect(imported.questionImport).toEqual({ format: "practice-v1", questions: codePractice.questions, bonusQuestions: [] });
    expect(imported.theory).toBe("# Циклы\n\n\nТеперь попробуй.");
    for (const privateField of ["referenceSolution", "expectedOutput", "explanation"]) expect(imported.theory).not.toContain(privateField);
  });

  it("supports classic embedded questions and Markdown fence length rules", () => {
    const md = `Теория\n\`\`\`\`kvantolingo\n${JSON.stringify([classicQuestion])}\n\`\`\`\`\n`;
    expect(parseLessonMarkdown(md).questionImport?.format).toBe("classic");
    const example = "````markdown\n```kvantolingo\nЭто пример команды\n```\n````";
    expect(parseLessonMarkdown(example)).toEqual({ theory: example, questionImport: null });
  });

  it("recognises a Windows BOM and CRLF command without leaking its answer", () => {
    const result = parseLessonMarkdown(`\uFEFF\`\`\`kvantolingo\r\n${JSON.stringify([classicQuestion])}\r\n\`\`\`\r\n# Текст\r\n`);
    expect(result.questionImport?.format).toBe("classic");
    expect(result.theory).toBe("# Текст\r\n");
  });

  it("rejects duplicate, broken, unclosed and unknown-version commands", () => {
    const command = `\`\`\`kvantolingo\n${JSON.stringify([classicQuestion])}\n\`\`\``;
    for (const raw of [
      `${command}\n${command}`,
      "```kvantolingo\n{bad}\n```",
      "```kvantolingo\n{}",
      "```kvantolingo json\n{}\n```",
      '```kvantolingo\n{"format":"practice-v2","questions":[]}\n```',
    ]) expect(() => parseLessonMarkdown(raw)).toThrow();
  });
});
