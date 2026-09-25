"use client";

import { useActionState, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from "lucide-react";

import { saveLesson, type LessonFormState } from "@/lib/actions/lessons";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import type { GroupTrack } from "@/generated/prisma";
import {
  CODE_LANGUAGES,
  type CodeLanguage,
  type LessonContent,
} from "@/lib/lesson-content";
import { LANGUAGE_LABELS, runCode } from "@/lib/code-runner";
import { Button } from "@/components/ui/button";

// WYSIWYG-редактор построен на Lexical и работает только в браузере,
// поэтому грузим его без SSR (см. комментарий в theory-editor.tsx).
const TheoryEditor = dynamic(
  () =>
    import("@/components/editor/theory-editor").then((m) => m.TheoryEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border-2 border-neutral-200 font-medium text-neutral-400">
        Загружаю редактор…
      </div>
    ),
  },
);

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";
const codeClass = inputClass + " font-mono text-sm";

// ── Состояние конструктора ──
// key — только для React (стабильный ключ при перестановках/удалении).
type EditorChoice = {
  kind: "choice";
  key: number;
  bonus: boolean;
  prompt: string;
  options: string[];
  correctIndex: number;
};
type EditorCode = {
  kind: "code";
  key: number;
  bonus: boolean;
  prompt: string;
  language: CodeLanguage;
  starterCode: string;
  expectedOutput: string;
  referenceSolution: string;
};
type EditorText = {
  kind: "text";
  key: number;
  bonus: boolean;
  prompt: string;
  correctAnswer: string;
};
type EditorQuestion = EditorChoice | EditorCode | EditorText;

let nextKey = 1;

function fromContent(content: LessonContent): EditorQuestion[] {
  const convert = (
    q: LessonContent["questions"][number],
    bonus: boolean,
  ): EditorQuestion => {
    if (q.type === "code") {
      return {
          kind: "code" as const,
          key: nextKey++,
          bonus,
          prompt: q.prompt,
          language: q.language ?? "python",
          starterCode: q.starterCode ?? "",
          expectedOutput: q.expectedOutput,
          referenceSolution: q.referenceSolution ?? "",
        };
    }
    if (q.type === "text") {
      return {
        kind: "text" as const,
        key: nextKey++,
        bonus,
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
      };
    }
    return {
      kind: "choice" as const,
      key: nextKey++,
      bonus,
      prompt: q.prompt,
      options: [...q.options],
      correctIndex: q.correctIndex,
    };
  };

  return [
    ...content.questions.map((q) => convert(q, false)),
    ...content.bonusQuestions.map((q) => convert(q, true)),
  ];
}

// Сериализация в формат Lesson.content (см. src/lib/lesson-content.ts).
function toContentJson(theory: string, questions: EditorQuestion[]): string {
  const serialize = (q: EditorQuestion) => {
    if (q.kind === "code") {
      return {
          type: "code" as const,
          prompt: q.prompt,
          language: q.language,
          starterCode: q.starterCode,
          expectedOutput: q.expectedOutput,
          referenceSolution: q.referenceSolution,
        };
    }
    if (q.kind === "text") {
      return {
        type: "text" as const,
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
      };
    }
    return {
      type: "choice" as const,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
    };
  };

  return JSON.stringify({
    theory,
    questions: questions.filter((q) => !q.bonus).map(serialize),
    bonusQuestions: questions.filter((q) => q.bonus).map(serialize),
  });
}

type CategoryOption = {
  id: number;
  name: string;
  track: GroupTrack;
  /** Порядок по умолчанию для нового урока в этой категории (max + 1). */
  nextSortOrder: number;
};

type LessonFormProps = {
  categories: CategoryOption[];
  /** Урок для правки; не передан — форма создания. */
  lesson?: {
    id: number;
    title: string;
    categoryId: number;
    xpReward: number;
    coinReward: number;
    sortOrder: number;
    content: LessonContent;
  };
};

// Одна форма на создание и правку: скрытое поле id пустое → create.
// Вопросы живут в React-состоянии и уходят на сервер одним скрытым
// JSON-полем contentJson.
export const LessonForm = ({ categories, lesson }: LessonFormProps) => {
  const [state, formAction, pending] = useActionState<
    LessonFormState,
    FormData
  >(saveLesson, null);

  const [theory, setTheory] = useState(lesson?.content.theory ?? "");
  const [questions, setQuestions] = useState<EditorQuestion[]>(() =>
    lesson ? fromContent(lesson.content) : [],
  );
  const [categoryId, setCategoryId] = useState(
    lesson?.categoryId ?? categories[0]?.id ?? 0,
  );
  // Порядок нового урока подставляем из выбранной категории, пока наставник
  // не тронул поле руками (touched).
  const sortTouched = useRef(false);
  const [sortOrder, setSortOrder] = useState(
    lesson?.sortOrder ??
      categories.find((c) => c.id === categoryId)?.nextSortOrder ??
      0,
  );

  const onCategoryChange = (id: number) => {
    setCategoryId(id);
    if (!lesson && !sortTouched.current) {
      setSortOrder(categories.find((c) => c.id === id)?.nextSortOrder ?? 0);
    }
  };

  // Патч без kind/key: их менять нельзя, а без kind типы choice и code
  // спокойно пересекаются (иначе intersection схлопнулся бы в never).
  type QuestionPatch = Partial<Omit<EditorChoice, "kind" | "key">> &
    Partial<Omit<EditorCode, "kind" | "key">> &
    Partial<Omit<EditorText, "kind" | "key">>;

  const update = (key: number, patch: QuestionPatch) => {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? ({ ...q, ...patch } as EditorQuestion) : q)),
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const question = next[index];
      if (!question) return prev;
      const sectionIndexes = next.flatMap((item, itemIndex) =>
        item.bonus === question.bonus ? [itemIndex] : [],
      );
      const sectionIndex = sectionIndexes.indexOf(index);
      const j = sectionIndexes[sectionIndex + dir];
      if (j === undefined) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const setBonus = (key: number, bonus: boolean) => {
    setQuestions((prev) => {
      const changed = prev.find((q) => q.key === key);
      if (!changed) return prev;
      const without = prev.filter((q) => q.key !== key);
      const updated = { ...changed, bonus } as EditorQuestion;
      const core = without.filter((q) => !q.bonus);
      const extras = without.filter((q) => q.bonus);
      return bonus ? [...core, ...extras, updated] : [...core, updated, ...extras];
    });
  };

  const remove = (key: number) => {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
  };

  const addChoice = (bonus = false) => {
    setQuestions((prev) => [
      ...prev,
      {
        kind: "choice",
        key: nextKey++,
        bonus,
        prompt: "",
        options: ["", ""],
        correctIndex: 0,
      },
    ]);
  };

  const addCode = (bonus = false) => {
    setQuestions((prev) => [
      ...prev,
      {
        kind: "code",
        key: nextKey++,
        bonus,
        prompt: "",
        language: "python",
        starterCode: "",
        expectedOutput: "",
        referenceSolution: "",
      },
    ]);
  };

  const addText = (bonus = false) => {
    setQuestions((prev) => [
      ...prev,
      {
        kind: "text",
        key: nextKey++,
        bonus,
        prompt: "",
        correctAnswer: "",
      },
    ]);
  };

  // Запуск эталонного решения (в браузере наставника) и автозаполнение
  // «Ожидаемого вывода» из его вывода.
  type RefRun = { running: boolean; note: string; failed: boolean };
  const [refRuns, setRefRuns] = useState<Record<number, RefRun>>({});

  const runReference = (
    key: number,
    language: CodeLanguage,
    solution: string,
  ) => {
    setRefRuns((prev) => ({
      ...prev,
      [key]: { running: true, note: "", failed: false },
    }));
    void runCode(language, solution).then((res) => {
      const done = (note: string, failed: boolean) =>
        setRefRuns((prev) => ({
          ...prev,
          [key]: { running: false, note, failed },
        }));
      if (!res.ok) {
        done(`Решение упало с ошибкой:\n${res.output}`, true);
        return;
      }
      if (res.output.trim() === "") {
        const call = language === "python" ? "print" : "console.log";
        done(`Решение ничего не печатает — добавь ${call}.`, true);
        return;
      }
      update(key, { expectedOutput: res.output });
      done("Готово: «Ожидаемый вывод» заполнен из вывода решения.", false);
    });
  };

  const coreCount = questions.filter((q) => !q.bonus).length;
  const bonusCount = questions.length - coreCount;
  const canMove = (index: number, dir: -1 | 1) => {
    const current = questions[index];
    if (!current) return false;
    const sectionIndexes = questions.flatMap((q, itemIndex) =>
      q.bonus === current.bonus ? [itemIndex] : [],
    );
    const sectionIndex = sectionIndexes.indexOf(index);
    return sectionIndexes[sectionIndex + dir] !== undefined;
  };

  return (
    <form action={formAction} className="flex w-full flex-col gap-y-4">
      <input type="hidden" name="id" value={lesson?.id ?? ""} />
      <input
        type="hidden"
        name="contentJson"
        value={toContentJson(theory, questions)}
      />

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Название урока</span>
        <input
          type="text"
          name="title"
          required
          maxLength={200}
          defaultValue={lesson?.title ?? ""}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Категория</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(e) => onCategoryChange(Number(e.target.value))}
            className={inputClass}
          >
            {TRACK_ORDER.map((track) => {
              const inTrack = categories.filter((c) => c.track === track);
              if (inTrack.length === 0) return null;
              return (
                <optgroup key={track} label={TRACK_LABELS[track]}>
                  {inTrack.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Порядок в категории</span>
          <input
            type="number"
            name="sortOrder"
            required
            min={0}
            value={sortOrder}
            onChange={(e) => {
              sortTouched.current = true;
              setSortOrder(Number(e.target.value));
            }}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">XP за прохождение</span>
          <input
            type="number"
            name="xpReward"
            required
            min={0}
            max={1000}
            defaultValue={lesson?.xpReward ?? 10}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Монеты за первое прохождение</span>
          <input
            type="number"
            name="coinReward"
            required
            min={0}
            max={20}
            defaultValue={lesson?.coinReward ?? 20}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Теория (гайд){" "}
          <span className="font-normal text-neutral-400">(необязательно)</span>
        </span>
        <TheoryEditor markdown={theory} onChange={setTheory} />
        <span className="text-sm text-neutral-400">
          Показывается ученику перед заданиями. Картинки можно перетащить в
          текст или вставить через Ctrl+V — они сами загрузятся в хранилище.
        </span>
      </div>

      <h2 className="mt-2 text-lg font-bold text-neutral-700">
        Основные задания ({coreCount}) · Со звёздочкой ({bonusCount})
      </h2>
      <p className="text-sm text-neutral-500">
        Задания со звёздочкой открываются после основной части и не влияют на
        завершение урока или основную награду.
      </p>

      {questions.map((q, index) => (
        <div
          key={q.key}
          className={
            "flex flex-col gap-y-3 rounded-2xl border-2 p-4 " +
            (q.bonus
              ? "border-amber-200 bg-amber-50/40"
              : "border-neutral-200")
          }
        >
          <div className="flex items-center gap-x-2">
            <span className="flex-1 text-xs font-bold uppercase tracking-wide text-neutral-400">
              {q.bonus ? "⭐ Дополнительное" : "Основное"}{" "}
              {questions
                .slice(0, index + 1)
                .filter((item) => item.bonus === q.bonus).length}
              {" · "}
              {q.kind === "code"
                ? `Код (${LANGUAGE_LABELS[q.language]})`
                : q.kind === "text"
                  ? "Свободный текст"
                  : "Выбор ответа"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canMove(index, -1)}
              onClick={() => move(index, -1)}
              aria-label="Выше"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canMove(index, 1)}
              onClick={() => move(index, 1)}
              aria-label="Ниже"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="dangerOutline"
              size="sm"
              onClick={() => remove(q.key)}
              aria-label="Удалить задание"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <label className="flex items-center gap-2 rounded-xl bg-white/70 p-2 text-sm font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={q.bonus}
              onChange={(event) => setBonus(q.key, event.target.checked)}
              className="h-5 w-5 accent-amber-500"
            />
            Задание со звёздочкой — показывать после основной части
          </label>

          <label className="flex flex-col gap-y-1.5">
            <span className="text-sm font-bold text-neutral-700">
              {q.kind === "code" ? "Задание" : "Вопрос"}
            </span>
            <textarea
              required
              rows={2}
              maxLength={q.kind === "code" ? 3000 : 1000}
              value={q.prompt}
              onChange={(e) => update(q.key, { prompt: e.target.value })}
              className={inputClass}
            />
          </label>

          {q.kind === "choice" ? (
            <div className="flex flex-col gap-y-2">
              <span className="text-sm font-bold text-neutral-700">
                Варианты (точкой отмечен правильный)
              </span>
              {q.options.map((option, i) => (
                <div key={i} className="flex items-center gap-x-2">
                  <input
                    type="radio"
                    name={`correct-${q.key}`}
                    checked={q.correctIndex === i}
                    onChange={() => update(q.key, { correctIndex: i })}
                    className="h-5 w-5 accent-green-500"
                    aria-label={`Правильный ответ — вариант ${i + 1}`}
                  />
                  <input
                    type="text"
                    required
                    maxLength={300}
                    value={option}
                    onChange={(e) =>
                      update(q.key, {
                        options: q.options.map((o, j) =>
                          j === i ? e.target.value : o,
                        ),
                      })
                    }
                    className={inputClass}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      update(q.key, {
                        options: q.options.filter((_, j) => j !== i),
                        correctIndex:
                          q.correctIndex === i
                            ? 0
                            : q.correctIndex > i
                              ? q.correctIndex - 1
                              : q.correctIndex,
                      })
                    }
                    aria-label={`Убрать вариант ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={q.options.length >= 8}
                onClick={() =>
                  update(q.key, { options: [...q.options, ""] })
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Вариант
              </Button>
            </div>
          ) : q.kind === "text" ? (
            <label className="flex flex-col gap-y-1.5">
              <span className="text-sm font-bold text-neutral-700">
                Эталонный ответ{" "}
                <span className="font-normal text-neutral-400">
                  (ученик его не видит)
                </span>
              </span>
              <input
                type="text"
                required
                maxLength={1000}
                value={q.correctAnswer}
                onChange={(e) =>
                  update(q.key, { correctAnswer: e.target.value })
                }
                className={inputClass}
              />
              <span className="text-sm text-neutral-400">
                Регистр, лишние пробелы и знаки препинания в конце ответа не
                учитываются. Знаки внутри фразы остаются значимыми.
              </span>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-y-1.5">
                <span className="text-sm font-bold text-neutral-700">
                  Язык
                </span>
                <select
                  value={q.language}
                  onChange={(e) =>
                    update(q.key, {
                      language: e.target.value as CodeLanguage,
                    })
                  }
                  className={inputClass + " sm:max-w-[220px]"}
                >
                  {CODE_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-y-1.5">
                <span className="text-sm font-bold text-neutral-700">
                  Стартовый код{" "}
                  <span className="font-normal text-neutral-400">
                    (то, что ученик видит в редакторе; можно пусто)
                  </span>
                </span>
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={q.starterCode}
                  onChange={(e) =>
                    update(q.key, { starterCode: e.target.value })
                  }
                  spellCheck={false}
                  className={codeClass}
                />
              </label>
              <label className="flex flex-col gap-y-1.5">
                <span className="text-sm font-bold text-neutral-700">
                  Эталонное решение{" "}
                  <span className="font-normal text-neutral-400">
                    (ученик его не видит)
                  </span>
                </span>
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={q.referenceSolution}
                  onChange={(e) =>
                    update(q.key, { referenceSolution: e.target.value })
                  }
                  spellCheck={false}
                  className={codeClass}
                />
                <span className="text-sm text-neutral-400">
                  Напиши правильное решение и нажми «Запустить» — «Ожидаемый
                  вывод» заполнится сам, без опечаток.
                </span>
              </label>
              <div className="flex flex-col gap-y-2">
                <Button
                  type="button"
                  variant="secondaryOutline"
                  size="sm"
                  className="self-start"
                  disabled={
                    q.referenceSolution.trim() === "" ||
                    refRuns[q.key]?.running
                  }
                  onClick={() =>
                    runReference(q.key, q.language, q.referenceSolution)
                  }
                >
                  <Play className="mr-2 h-4 w-4" />
                  {refRuns[q.key]?.running
                    ? "Запускаю…"
                    : "Запустить решение"}
                </Button>
                {refRuns[q.key]?.note && (
                  <pre
                    className={
                      "whitespace-pre-wrap rounded-xl p-3 font-sans text-sm font-medium " +
                      (refRuns[q.key].failed
                        ? "bg-rose-50 text-rose-600"
                        : "bg-green-50 text-green-700")
                    }
                  >
                    {refRuns[q.key].note}
                  </pre>
                )}
              </div>

              <label className="flex flex-col gap-y-1.5">
                <span className="text-sm font-bold text-neutral-700">
                  Ожидаемый вывод программы
                </span>
                <textarea
                  required
                  rows={2}
                  maxLength={3000}
                  value={q.expectedOutput}
                  onChange={(e) =>
                    update(q.key, { expectedOutput: e.target.value })
                  }
                  spellCheck={false}
                  className={codeClass}
                />
                <span className="text-sm text-neutral-400">
                  Задание засчитывается, когда print-вывод ученика совпадёт с
                  этим текстом. Сравнение щадящее: кавычки любого вида, лишние
                  пробелы, ё/е и пустые строки по краям не считаются ошибкой.
                </span>
              </label>
            </>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondaryOutline"
          onClick={() => addChoice()}
        >
          <Plus className="mr-2 h-5 w-5" />
          Основной вопрос
        </Button>
        <Button
          type="button"
          variant="secondaryOutline"
          onClick={() => addText()}
        >
          <Plus className="mr-2 h-5 w-5" />
          Основной текстовый ответ
        </Button>
        <Button
          type="button"
          variant="secondaryOutline"
          onClick={() => addCode()}
        >
          <Plus className="mr-2 h-5 w-5" />
          Основное задание с кодом
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => addChoice(true)}
        >
          ⭐ Дополнительный вопрос
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => addText(true)}
        >
          ⭐ Дополнительный текстовый ответ
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => addCode(true)}
        >
          ⭐ Дополнительный код
        </Button>
      </div>

      {state?.error && (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-600">
          {state.error}
        </p>
      )}

      <div className="mb-10 mt-2 flex items-center gap-x-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/lessons">Отмена</Link>
        </Button>
      </div>
    </form>
  );
};
