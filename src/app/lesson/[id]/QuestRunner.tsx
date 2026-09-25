"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import confetti from "canvas-confetti";

import { AchievementToastStack } from "@/components/AchievementToast";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import type { UnlockedAchievement } from "@/lib/achievements";
import {
  checkAnswer,
  checkTextAnswer,
  completeLesson,
  recordCorrectAnswer,
  type CompleteLessonResult,
} from "@/lib/actions/gamification";
import {
  recordCodeAttempt,
  reportLessonPosition,
} from "@/lib/actions/classroom";
import { questionKind, type SafeLessonContent } from "@/lib/lesson-content";
import { outputsMatch } from "@/lib/output-match";
import { prewarmCode, runCode } from "@/lib/code-runner";
import { splitTheoryIntoSections } from "@/lib/theory-sections";

import { Challenge } from "./challenge";
import { CodeChallenge } from "./code-challenge";
import { Footer } from "./footer";
import { Header } from "./header";
import { ResultCard } from "./result-card";
import { TextChallenge } from "./text-challenge";

// Жизни показывают, что наставнику уже стоит помочь, но не запирают урок.
const MAX_HEARTS = 3;
const RETRY_COOLDOWN_SECONDS = 5;

type Props = {
  lessonId: number;
  title: string;
  /** Контент без ответов (sanitizeLessonContent) — их проверяет сервер. */
  content: SafeLessonContent;
  /** Урок уже пройден раньше → это «тренировка», XP повторно не начислится. */
  alreadyCompleted: boolean;
  previewMode?: boolean;
  /** Ключ включает пользователя, чтобы общий компьютер не смешивал шаги детей. */
  theoryProgressKey: string;
};

function fireConfetti() {
  const burst = (origin: { x: number; y: number }) =>
    confetti({
      particleCount: 90,
      spread: 80,
      startVelocity: 45,
      origin,
      colors: ["#58cc02", "#4ade80", "#ffd900", "#ff9600", "#1cb0f6"],
      scalar: 1.1,
    });
  burst({ x: 0.2, y: 0.5 });
  burst({ x: 0.5, y: 0.4 });
  burst({ x: 0.8, y: 0.5 });
}

export function QuestRunner({
  lessonId,
  title,
  content,
  alreadyCompleted,
  previewMode = false,
  theoryProgressKey,
}: Props) {
  const coreQuestions = content.questions;
  const bonusQuestions = content.bonusQuestions;
  const coreTotal = coreQuestions.length;
  const theorySections = useMemo(
    () => splitTheoryIntoSections(content.theory),
    [content.theory],
  );
  const theoryTotal = theorySections.length;
  const hasTheory = theoryTotal > 0;

  // Урок: теория → обязательные задачи → необязательные задачи со звёздочкой.
  const [phase, setPhase] = useState<"theory" | "tasks" | "bonus">(
    hasTheory ? "theory" : "tasks",
  );
  const questions = phase === "bonus" ? bonusQuestions : coreQuestions;
  const total = questions.length;
  const section = phase === "bonus" ? "bonus" : "core";
  const [activeIndex, setActiveIndex] = useState(0);
  const [theoryIndex, setTheoryIndex] = useState(0);
  const theoryScrollRef = useRef<HTMLDivElement>(null);
  const [selectedOption, setSelectedOption] = useState<number | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<"none" | "correct" | "wrong">("none");
  const [textAnswer, setTextAnswer] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  // Ответ проверяет сервер (checkAnswer) — на время запроса блокируем кнопку.
  const [checking, setChecking] = useState(false);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [completedCount, setCompletedCount] = useState(0);
  const [result, setResult] = useState<CompleteLessonResult | null>(null);
  const [bonusFinished, setBonusFinished] = useState(false);
  const [toasts, setToasts] = useState<UnlockedAchievement[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!hasTheory) return;
    let saved = Number.NaN;
    try {
      saved = Number.parseInt(
        window.sessionStorage.getItem(theoryProgressKey) ?? "",
        10,
      );
    } catch {
      return;
    }
    if (!Number.isInteger(saved) || saved < 0 || saved >= theoryTotal) return;
    // Восстановление внешнего состояния вкладки после обновления страницы.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheoryIndex(saved);
  }, [hasTheory, theoryProgressKey, theoryTotal]);

  useEffect(() => {
    theoryScrollRef.current?.scrollTo({ top: 0 });
  }, [theoryIndex]);

  // Код ученика по номерам заданий (сохраняется при «Повторить» и при
  // возврате к заданию), вывод последнего запуска и флаг «выполняется».
  const [codeByIndex, setCodeByIndex] = useState<Record<number, string>>({});
  const [codeOutput, setCodeOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Неудачные запуски по номерам заданий: после второй неудачи CodeChallenge
  // показывает ожидаемый вывод целиком (раньше — только подсказку без ответа).
  const [codeFailsByIndex, setCodeFailsByIndex] = useState<
    Record<number, number>
  >({});

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  // Если в уроке есть код-задания — начинаем греть их движки заранее,
  // пока ученик читает теорию/отвечает на вопросы (тяжёлый только Python).
  useEffect(() => {
    for (const q of [...coreQuestions, ...bonusQuestions]) {
      if (q.type === "code") prewarmCode(q.language);
    }
  }, [coreQuestions, bonusQuestions]);

  // Наставник видит позицию максимум через несколько секунд. Heartbeat нужен,
  // чтобы отличать открытый урок от давно оставленной вкладки.
  useEffect(() => {
    if (
      previewMode ||
      bonusFinished ||
      (result !== null && phase !== "bonus")
    ) {
      return;
    }
    const report = () => {
      void reportLessonPosition(
        lessonId,
        phase,
        phase === "theory" ? theoryIndex : activeIndex,
      ).catch(() => {
        // При уходе со страницы браузер штатно отменяет этот необязательный
        // heartbeat. Учебный прогресс от него не зависит.
      });
    };
    report();
    const timer = window.setInterval(report, 10_000);
    return () => window.clearInterval(timer);
  }, [
    activeIndex,
    bonusFinished,
    lessonId,
    phase,
    previewMode,
    result,
    theoryIndex,
  ]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const challenge = questions[activeIndex];
  const theorySection = theorySections[theoryIndex] ?? theorySections[0];
  const kind = challenge ? questionKind(challenge) : "choice";
  const currentCode =
    kind === "code" && challenge?.type === "code"
      ? codeByIndex[activeIndex] ?? challenge.starterCode ?? ""
      : "";
  const coreLearningTotal = theoryTotal + coreTotal;
  const percentage =
    phase === "bonus"
      ? total === 0
        ? 100
        : Math.round((completedCount / total) * 100)
      : coreLearningTotal === 0
        ? 100
        : Math.round(
            ((phase === "theory"
              ? theoryIndex
              : theoryTotal + completedCount) /
              coreLearningTotal) *
              100,
          );

  const onSelect = (index: number) => {
    if (status !== "none") return;
    setSelectedOption(index);
  };

  const finalize = () => {
    if (previewMode) {
      setResult({
        gainedXp: 0,
        gainedCoins: 0,
        totalXp: 0,
        level: 0,
        leveledUp: false,
        lastActiveDate: new Date(),
        firstCompletion: false,
        unlockedAchievements: [],
      });
      fireConfetti();
      return;
    }
    startTransition(async () => {
      try {
        // Перфект = ни одной потерянной жизни. Урок без заданий (total === 0)
        // перфектом не считается — там нечего было проходить без ошибок.
        const res = await completeLesson(lessonId, {
          perfect: coreTotal > 0 && hearts === MAX_HEARTS,
        });
        setResult(res);
        if (res.unlockedAchievements.length > 0) {
          setToasts((prev) => [...prev, ...res.unlockedAchievements]);
        }
        fireConfetti();
      } catch (err) {
        console.error("completeLesson failed", err);
      }
    });
  };

  const markCorrect = () => {
    setStatus("correct");
    setCompletedCount((c) => c + 1);
    // Пошаговый прогресс фиксируем в фоне (только при первом прохождении).
    if (section === "core" && !alreadyCompleted && !previewMode) {
      void recordCorrectAnswer(lessonId).catch((err) =>
        console.error("recordCorrectAnswer failed", err),
      );
    }
  };

  const markWrong = () => {
    setStatus("wrong");
    setHearts((current) => Math.max(0, current - 1));
    setCooldownSeconds(RETRY_COOLDOWN_SECONDS);
  };

  const onContinue = () => {
    // Повтор после неверного доступен после короткой паузы. Код и введённый
    // текст сохраняем, чтобы ученик исправлял ответ, а не набирал его заново.
    if (status === "wrong") {
      if (cooldownSeconds > 0) return;
      setStatus("none");
      setSelectedOption(undefined);
      return;
    }

    // «Далее» после верного — следующее задание или финал.
    if (status === "correct") {
      const isLast = activeIndex === total - 1;
      if (isLast) {
        if (phase === "bonus") {
          setBonusFinished(true);
          fireConfetti();
        } else {
          finalize();
        }
      } else {
        setActiveIndex((i) => i + 1);
        setStatus("none");
        setSelectedOption(undefined);
        setTextAnswer("");
        setCooldownSeconds(0);
        setCodeOutput(null);
      }
      return;
    }

    if (!challenge) return;

    // «Проверить» для задания с кодом: запускаем код и сверяем вывод.
    if (kind === "code" && challenge.type === "code") {
      if (running) return;
      setRunning(true);
      void runCode(challenge.language, currentCode).then((res) => {
        setRunning(false);
        setCodeOutput(res.output);
        // Сравнение «мягкое»: кавычки, лишние пробелы, ё/е и пустые строки
        // по краям не считаются ошибкой (см. output-match.ts).
        const passed =
          res.ok && outputsMatch(res.output, challenge.expectedOutput);
        if (!previewMode) {
          void recordCodeAttempt(
            lessonId,
            section,
            activeIndex,
            passed,
          ).catch((err) => console.error("recordCodeAttempt failed", err));
        }
        if (passed) {
          markCorrect();
        } else {
          markWrong();
          setCodeFailsByIndex((prev) => ({
            ...prev,
            [activeIndex]: (prev[activeIndex] ?? 0) + 1,
          }));
        }
      });
      return;
    }

    // Свободный текст проверяет сервер: эталон не попадает в браузер.
    if (kind === "text" && challenge.type === "text") {
      if (checking || textAnswer.trim() === "") return;
      setChecking(true);
      void checkTextAnswer(lessonId, activeIndex, textAnswer, section)
        .then((correct) => {
          if (correct) {
            markCorrect();
          } else {
            markWrong();
          }
        })
        .catch((err) => {
          console.error("checkTextAnswer failed", err);
        })
        .finally(() => setChecking(false));
      return;
    }

    // «Проверить» для вопроса с вариантами. Правильный ответ знает только
    // сервер — спрашиваем его (в клиентском payload ответов больше нет).
    if (
      selectedOption === undefined ||
      challenge.type === "code" ||
      challenge.type === "text"
    ) {
      return;
    }
    if (checking) return;

    setChecking(true);
    void checkAnswer(lessonId, activeIndex, selectedOption, section)
      .then((correct) => {
        if (correct) {
          markCorrect();
        } else {
          markWrong();
        }
      })
      .catch((err) => {
        // Сеть моргнула — не засчитываем ни ответ, ни ошибку, пусть нажмёт ещё раз.
        console.error("checkAnswer failed", err);
      })
      .finally(() => setChecking(false));
  };

  const goToTheoryStep = (nextIndex: number) => {
    const safeIndex = Math.max(0, Math.min(theoryTotal - 1, nextIndex));
    setTheoryIndex(safeIndex);
    try {
      window.sessionStorage.setItem(theoryProgressKey, String(safeIndex));
    } catch {
      // Запрет sessionStorage не должен мешать прохождению урока.
    }
  };

  const continueTheory = () => {
    if (theoryIndex < theoryTotal - 1) {
      goToTheoryStep(theoryIndex + 1);
      return;
    }
    try {
      window.sessionStorage.removeItem(theoryProgressKey);
    } catch {
      // Удаление необязательного локального состояния можно пропустить.
    }
    // Урок без заданий завершается сразу после последнего шага теории.
    if (coreTotal === 0) {
      finalize();
    } else {
      setPhase("tasks");
    }
  };

  // ── Экран результата дополнительных заданий ──
  if (bonusFinished) {
    return (
      <>
        <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-y-5 px-6 text-center">
          <div className="text-6xl lg:text-7xl">⭐</div>
          <h1 className="text-xl font-bold text-neutral-700 lg:text-3xl">
            Все задания со звёздочкой решены!
          </h1>
          <p className="text-neutral-500">
            Основная часть урока уже была завершена. Дополнительные задания не
            изменяли её награду.
          </p>
        </div>
        <Footer
          status="completed"
          onCheck={() => {
            window.location.href = previewMode
              ? `/admin/lessons/${lessonId}`
              : "/learn";
          }}
        />
      </>
    );
  }

  // ── Экран результата основной части ──
  if (result && phase !== "bonus") {
    return (
      <>
        <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-y-4 px-6 text-center lg:gap-y-8">
          <div className="text-6xl lg:text-7xl">🎉</div>

          <h1 className="text-lg font-bold text-neutral-700 lg:text-3xl">
            {previewMode ? "Предпросмотр завершён" : "Отлично! Урок пройден."}
          </h1>

          {previewMode ? (
            <p className="text-neutral-500">
              Прогресс, XP, монеты и достижения не сохранялись.
            </p>
          ) : (
            <div className="flex w-full items-center gap-x-4">
              <ResultCard variant="points" value={result.gainedXp} />
              <ResultCard variant="coins" value={result.gainedCoins} />
              <ResultCard variant="hearts" value={hearts} />
            </div>
          )}

          {result.leveledUp && (
            <p className="text-base font-bold text-green-600 lg:text-lg">
              Новый уровень {result.level}! 🚀
            </p>
          )}

          {bonusQuestions.length > 0 && (
            <Button
              type="button"
              variant="secondaryOutline"
              size="lg"
              onClick={() => {
                setPhase("bonus");
                setActiveIndex(0);
                setCompletedCount(0);
                setSelectedOption(undefined);
                setTextAnswer("");
                setCooldownSeconds(0);
                setStatus("none");
                setCodeOutput(null);
              }}
            >
              ⭐ Перейти к заданиям со звёздочкой
            </Button>
          )}
        </div>

        <Footer
          status="completed"
          onCheck={() => {
            window.location.href = previewMode
              ? `/admin/lessons/${lessonId}`
              : "/learn";
          }}
        />

        <AchievementToastStack achievements={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // ── Теория перед заданиями ──
  if (phase === "theory") {
    return (
      <>
        <Header
          hearts={hearts}
          percentage={percentage}
          stepLabel={`Теория · шаг ${theoryIndex + 1} из ${theoryTotal}`}
          exitHref={previewMode ? `/admin/lessons/${lessonId}` : "/learn"}
        />

        <div ref={theoryScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto w-full max-w-[860px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-neutral-400 lg:text-start">
              {previewMode
                ? "Предпросмотр · "
                : alreadyCompleted
                  ? "Тренировка · "
                  : ""}
              {title}
            </p>
            <Markdown>{theorySection?.markdown ?? content.theory}</Markdown>
          </article>
        </div>

        <Footer
          status="completed"
          disabled={isPending}
          onBack={() => goToTheoryStep(theoryIndex - 1)}
          backDisabled={theoryIndex === 0}
          primaryLabel={
            theoryIndex < theoryTotal - 1
              ? "Продолжить"
              : coreTotal > 0
                ? "К заданиям"
                : "Завершить урок"
          }
          onCheck={continueTheory}
        />

        <AchievementToastStack achievements={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // ── Урок без заданий и без теории (защита от пустого контента) ──
  if (total === 0) {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-y-6 px-6 text-center">
        <h1 className="text-lg font-bold text-neutral-700 lg:text-2xl">
          {phase === "bonus"
            ? "В этом уроке нет заданий со звёздочкой."
            : "В этом уроке пока нет основных заданий."}
        </h1>
        {phase !== "bonus" && bonusQuestions.length > 0 ? (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              finalize();
            }}
          >
            Завершить основную часть
          </Button>
        ) : (
          <Button variant="secondary" size="lg" asChild>
            <Link href="/learn">Вернуться к курсу</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Header
        hearts={hearts}
        percentage={percentage}
        stepLabel={
          phase === "bonus"
            ? `Со звёздочкой · задание ${activeIndex + 1} из ${total}`
            : `Практика · задание ${activeIndex + 1} из ${total}`
        }
        exitHref={previewMode ? `/admin/lessons/${lessonId}` : "/learn"}
      />

      <div className="flex-1">
        <div className="flex h-full items-center justify-center">
          <div className="flex w-full max-w-[760px] flex-col gap-y-10 px-5 py-8 sm:px-8 lg:min-h-[350px] lg:px-10">
            <div className="space-y-2">
              {alreadyCompleted && (
                <p className="text-center text-xs font-bold uppercase tracking-wide text-neutral-400 lg:text-start">
                  Тренировка · {title}
                </p>
              )}
              {phase === "bonus" && (
                <p className="text-center text-xs font-bold uppercase tracking-wide text-amber-500 lg:text-start">
                  ⭐ Задание со звёздочкой {activeIndex + 1} из {total}
                </p>
              )}
              <h1 className="whitespace-pre-wrap text-center text-lg font-bold text-neutral-700 lg:text-start lg:text-3xl">
                {challenge.prompt}
              </h1>
            </div>

            {kind === "code" ? (
              <CodeChallenge
                code={currentCode}
                onChange={(code) =>
                  setCodeByIndex((prev) => ({ ...prev, [activeIndex]: code }))
                }
                language={
                  challenge.type === "code" ? challenge.language : "python"
                }
                output={codeOutput}
                running={running}
                status={status}
                expectedOutput={
                  challenge.type === "code" ? challenge.expectedOutput : ""
                }
                fails={codeFailsByIndex[activeIndex] ?? 0}
              />
            ) : kind === "text" && challenge.type === "text" ? (
              <TextChallenge
                value={textAnswer}
                onChange={setTextAnswer}
                status={status}
                disabled={isPending || checking}
              />
            ) : (
              challenge.type !== "code" &&
              challenge.type !== "text" && (
                <Challenge
                  options={challenge.options}
                  onSelect={onSelect}
                  status={status}
                  selectedOption={selectedOption}
                  disabled={isPending}
                />
              )
            )}
          </div>
        </div>
      </div>

      <Footer
        status={status}
        onCheck={onContinue}
        disabled={
          isPending ||
          running ||
          checking ||
          (status === "wrong" && cooldownSeconds > 0) ||
          (status === "none" &&
            (kind === "code"
              ? currentCode.trim() === ""
              : kind === "text"
                ? textAnswer.trim() === ""
                : selectedOption === undefined))
        }
        cooldownSeconds={status === "wrong" ? cooldownSeconds : 0}
      />

      <AchievementToastStack achievements={toasts} onDismiss={dismissToast} />
    </>
  );
}
