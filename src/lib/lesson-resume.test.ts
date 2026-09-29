import { describe, expect, it } from "vitest";

import { computeLessonResume } from "./lesson-resume";

const base = {
  isCompleted: false,
  theoryStep: 0,
  answeredCount: 0,
  wrongAttempts: 0,
  theoryTotal: 2,
  coreTotal: 3,
};

describe("computeLessonResume", () => {
  it("новый урок начинается с первого шага теории", () => {
    const r = computeLessonResume(base);
    expect(r).toMatchObject({
      phase: "theory",
      theoryIndex: 0,
      questionIndex: 0,
      hearts: 3,
      resumed: false,
      finishImmediately: false,
    });
  });

  it("возвращает на сохранённый шаг теории с подсказкой", () => {
    const r = computeLessonResume({ ...base, theoryStep: 1 });
    expect(r).toMatchObject({ phase: "theory", theoryIndex: 1, resumed: true });
  });

  it("пройденная теория открывает задания", () => {
    const r = computeLessonResume({ ...base, theoryStep: 2 });
    expect(r).toMatchObject({ phase: "tasks", questionIndex: 0, resumed: true });
  });

  it("продолжает со следующего нерешённого задания", () => {
    const r = computeLessonResume({ ...base, theoryStep: 2, answeredCount: 1 });
    expect(r).toMatchObject({ phase: "tasks", questionIndex: 1, resumed: true });
  });

  it("старый прогресс без theoryStep (answeredCount > 0) тоже попадает в задания", () => {
    const r = computeLessonResume({ ...base, answeredCount: 2 });
    expect(r).toMatchObject({ phase: "tasks", questionIndex: 2, resumed: true });
  });

  it("выход не лечит потерянные жизни", () => {
    const r = computeLessonResume({
      ...base,
      theoryStep: 2,
      wrongAttempts: 2,
    });
    expect(r).toMatchObject({ phase: "tasks", hearts: 1, resumed: true });
  });

  it("пройденный урок открывается заново как тренировка", () => {
    const r = computeLessonResume({
      ...base,
      isCompleted: true,
      theoryStep: 2,
      answeredCount: 3,
      wrongAttempts: 1,
    });
    expect(r).toMatchObject({
      phase: "theory",
      theoryIndex: 0,
      questionIndex: 0,
      hearts: 3,
      resumed: false,
      finishImmediately: false,
    });
  });

  it("редактура урока зажимает индексы в новые границы", () => {
    const r = computeLessonResume({
      ...base,
      theoryStep: 9,
      answeredCount: 8,
      theoryTotal: 1,
      coreTotal: 2,
    });
    expect(r.phase).toBe("tasks");
    expect(r.questionIndex).toBe(1);
  });

  it("всё решено, но «Далее» не нажали — урок завершается сам", () => {
    const r = computeLessonResume({
      ...base,
      theoryStep: 2,
      answeredCount: 3,
    });
    expect(r).toMatchObject({ phase: "tasks", finishImmediately: true });
  });

  it("новый урок без теории не показывает подсказку о возврате", () => {
    const r = computeLessonResume({ ...base, theoryTotal: 0 });
    expect(r).toMatchObject({ phase: "tasks", questionIndex: 0, resumed: false });
  });

  it("урок без заданий возвращает на шаг теории", () => {
    const r = computeLessonResume({
      ...base,
      theoryStep: 1,
      coreTotal: 0,
    });
    expect(r).toMatchObject({ phase: "theory", theoryIndex: 1, resumed: true });
  });
});
