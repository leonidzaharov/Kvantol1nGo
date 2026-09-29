// ============================================================
// Возврат ученика в урок на место остановки.
//
// В базе хранятся только факты: шаг теории (theoryStep), сколько заданий
// решено верно (answeredCount) и сколько раз ошибся (wrongAttempts). Из них
// чистая функция восстанавливает экран, с которого можно продолжить, —
// её же покрывает юнит-тест без базы.
// ============================================================

export const LESSON_MAX_HEARTS = 3;

export type LessonResumeState = {
  /** С какой фазы открыть урок. */
  phase: "theory" | "tasks";
  /** Шаг теории (0..theoryTotal-1). */
  theoryIndex: number;
  /** Индекс задания в основной части (0..coreTotal-1). */
  questionIndex: number;
  /** Жизни на старте: выход из урока «не лечит» ошибки. */
  hearts: number;
  /** Ученик возвращается на сохранённое место — показать подсказку. */
  resumed: boolean;
  /** Все задания уже решены, осталось дождаться завершения — завершаем сразу. */
  finishImmediately: boolean;
};

export type LessonResumeInput = {
  isCompleted: boolean;
  theoryStep: number;
  answeredCount: number;
  wrongAttempts: number;
  /** Число шагов теории в ТЕКУЩЕМ контенте урока. */
  theoryTotal: number;
  /** Число обязательных заданий в ТЕКУЩЕМ контенте урока. */
  coreTotal: number;
  maxHearts?: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function computeLessonResume({
  isCompleted,
  theoryStep,
  answeredCount,
  wrongAttempts,
  theoryTotal,
  coreTotal,
  maxHearts = LESSON_MAX_HEARTS,
}: LessonResumeInput): LessonResumeState {
  const hearts = clamp(maxHearts - wrongAttempts, 0, maxHearts);

  // Пройденный урок — это тренировка: всегда с чистого листа.
  if (isCompleted) {
    return {
      phase: theoryTotal > 0 ? "theory" : "tasks",
      theoryIndex: 0,
      questionIndex: 0,
      hearts: maxHearts,
      resumed: false,
      finishImmediately: false,
    };
  }

  // Урок без заданий — только теория.
  if (coreTotal === 0) {
    const theoryIndex =
      theoryTotal > 0 ? clamp(theoryStep, 0, theoryTotal - 1) : 0;
    return {
      phase: theoryTotal > 0 ? "theory" : "tasks",
      theoryIndex,
      questionIndex: 0,
      hearts,
      resumed: theoryIndex > 0,
      finishImmediately: false,
    };
  }

  // В задания попадаем, если теория пройдена (theoryStep >= theoryTotal),
  // её не было, или есть фактические ответы — у прогресса, записанного до
  // появления theoryStep, answeredCount уже мог быть > 0.
  const theoryDone =
    theoryTotal === 0 || theoryStep >= theoryTotal || answeredCount > 0;

  if (!theoryDone) {
    return {
      phase: "theory",
      theoryIndex: clamp(theoryStep, 0, theoryTotal - 1),
      questionIndex: 0,
      hearts,
      resumed: theoryStep > 0,
      finishImmediately: false,
    };
  }

  // answeredCount указывает на следующее нерешённое задание: задания идут
  // по порядку, дальше пройти нельзя без верного ответа. Если наставник
  // убрал задания — зажимаем индекс в новые границы.
  const questionIndex = clamp(answeredCount, 0, coreTotal - 1);
  return {
    phase: "tasks",
    theoryIndex: 0,
    questionIndex,
    hearts,
    resumed:
      answeredCount > 0 ||
      wrongAttempts > 0 ||
      (theoryTotal > 0 && theoryStep >= theoryTotal),
    // Решены все, но «Далее» не нажали (закрыли вкладку) — урок сам завершится.
    finishImmediately: answeredCount >= coreTotal,
  };
}
