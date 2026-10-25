"use client";

import { useActionState, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUp, FolderInput, Play, Plus, Trash2, Upload } from "lucide-react";

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
import { PracticeEditor } from "@/components/practice/PracticeEditor";
import type { StoredPracticeContent } from "@/lib/practice-content";
import { mergeLessonQuestionImport } from "@/lib/practice-editor";
import {
  isPracticeContent,
  parseLessonMarkdown,
  parseLessonQuestionsImport,
  type LessonQuestionsImport,
} from "@/lib/lesson-document";
import { uploadImageFile } from "@/lib/image-upload";
import {
  extractRelativeImagePaths,
  importTheoryFolder,
  pickMarkdownFile,
  type TheoryImportProgress,
} from "@/lib/lesson-import";

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
function toContent(theory: string, questions: EditorQuestion[]): LessonContent {
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

  return {
    theory,
    questions: questions.filter((q) => !q.bonus).map(serialize),
    bonusQuestions: questions.filter((q) => q.bonus).map(serialize),
  };
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
  contentLocked?: boolean;
  /** Урок для правки; не передан — форма создания. */
  lesson?: {
    id: number;
    title: string;
    categoryId: number;
    xpReward: number;
    coinReward: number;
    sortOrder: number;
    content: LessonContent | StoredPracticeContent;
  };
};

// Одна форма на создание и правку: скрытое поле id пустое → create.
// Вопросы живут в React-состоянии и уходят на сервер одним скрытым
// JSON-полем contentJson.
export const LessonForm = ({ categories, lesson, contentLocked = false }: LessonFormProps) => {
  const [state, formAction, pending] = useActionState<
    LessonFormState,
    FormData
  >(saveLesson, null);

  const initialPractice = lesson?.content && isPracticeContent(lesson.content)
    ? lesson.content
    : null;
  const [format, setFormat] = useState<"classic" | "practice-v1">(initialPractice ? "practice-v1" : "classic");
  const [theory, setTheory] = useState(lesson?.content.theory ?? "");
  const [questions, setQuestions] = useState<EditorQuestion[]>(() =>
    lesson && !initialPractice ? fromContent(lesson.content as LessonContent) : [],
  );
  const [practice, setPractice] = useState<StoredPracticeContent>(initialPractice ?? {
    format: "practice-v1", theory: "", questions: [], bonusQuestions: [],
  });
  const [coinReward, setCoinReward] = useState(lesson?.coinReward ?? 20);
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

  // JSON и Markdown используют один разбор. Замена заданий всегда явная.
  const [importNote, setImportNote] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    questions: LessonQuestionsImport;
    theory?: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);

  const currentQuestionImport = (): LessonQuestionsImport => {
    if (format === "practice-v1") return { format, questions: practice.questions, bonusQuestions: practice.bonusQuestions };
    const current = toContent("", questions);
    return { format, questions: current.questions, bonusQuestions: current.bonusQuestions };
  };
  const allowFormatChange = !lesson && questions.length === 0 && practice.questions.length + practice.bonusQuestions.length === 0;
  const queueQuestionImport = (incoming: LessonQuestionsImport, importedTheory?: string) => {
    if (incoming.format !== format && !allowFormatChange) {
      throw new Error("Формат импортируемых заданий отличается. Для него создай новый урок. Текущие задания сохранены.");
    }
    setPendingImport({ questions: incoming, theory: importedTheory });
  };
  const applyQuestionImport = (mode: "append" | "replace") => {
    if (!pendingImport || contentLocked) return;
    try {
      const merged = mergeLessonQuestionImport(currentQuestionImport(), pendingImport.questions, mode, allowFormatChange);
      if (merged.format === "practice-v1") {
        setPractice({ format: "practice-v1", theory: "", questions: merged.questions, bonusQuestions: merged.bonusQuestions });
      } else {
        setQuestions(fromContent({ theory: "", questions: merged.questions, bonusQuestions: merged.bonusQuestions }));
      }
      setFormat(merged.format);
      if (pendingImport.theory !== undefined) {
        setTheory(pendingImport.theory);
        setTheoryKey((key) => key + 1);
      }
      setImportNote(`Готово: ${merged.questions.length} основных и ${merged.bonusQuestions.length} дополнительных заданий.`);
      setPendingImport(null);
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "Не удалось применить импорт");
    }
  };

  const importQuestions = async (file: File) => {
    if (contentLocked || importBusyRef.current || pendingImport) return;
    importBusyRef.current = true;
    setTheoryImporting(true);
    setImportNote(null);
    try {
      queueQuestionImport(parseLessonQuestionsImport(JSON.parse(await file.text())));
    } catch (error) {
      setImportNote(error instanceof SyntaxError ? "Не удалось прочитать файл - это точно JSON?" : error instanceof Error ? error.message : "Не удалось импортировать задания");
    } finally {
      importBusyRef.current = false;
      setTheoryImporting(false);
      // Сбрасываем input, чтобы повторный выбор того же файла сработал.
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // ── Импорт теории из папки комплекта ──
  // Наставник выбирает папку с .md-гайдом и картинками. Браузер читает
  // markdown, грузит все картинки с относительными путями через обычный
  // upload и подменяет ссылки на /media/<имя>. Повторный импорт урока,
  // который уже собран (/media-ссылки в тексте), файлы не грузит заново.
  const [theoryKey, setTheoryKey] = useState(0);
  const [theoryImport, setTheoryImport] = useState<TheoryImportProgress | null>(null);
  const [theoryImporting, setTheoryImporting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const importMarkdown = async (file: File) => {
    if (contentLocked || importBusyRef.current || pendingImport) return;
    importBusyRef.current = true;
    setTheoryImporting(true);
    setImportNote(null);
    try {
      const result = parseLessonMarkdown(await file.text());
      if (extractRelativeImagePaths(result.theory).length > 0) {
        throw new Error("В Markdown есть картинки из папки. Используй «Импорт из папки», чтобы загрузить их вместе с уроком. Текущий урок сохранён.");
      }
      if (result.questionImport) queueQuestionImport(result.questionImport, result.theory);
      else {
        setTheory(result.theory);
        setTheoryKey((key) => key + 1);
        setImportNote("Теория импортирована. Текущие задания сохранены.");
      }
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "Не удалось прочитать Markdown");
    } finally {
      importBusyRef.current = false;
      setTheoryImporting(false);
      if (markdownInputRef.current) markdownInputRef.current.value = "";
    }
  };

  const importFolder = async (files: File[]) => {
    if (importBusyRef.current || pendingImport || contentLocked) return;
    importBusyRef.current = true;
    setTheoryImporting(true);
    setTheoryImport(null);
    try {
      const markdownFile = await pickMarkdownFile(files);
      if (!markdownFile) throw new Error("В папке нет файла .md");
      const preflight = parseLessonMarkdown(await markdownFile.text());
      if (preflight.questionImport && preflight.questionImport.format !== format && !allowFormatChange) {
        throw new Error("Формат импортируемых заданий отличается. Для него создай новый урок. Текущие задания сохранены.");
      }
      const result = await importTheoryFolder(files, uploadImageFile, setTheoryImport);
      if (result.questionImport) {
        queueQuestionImport(result.questionImport, result.markdown);
      } else {
        setTheory(result.markdown);
        setTheoryKey((k) => k + 1);
      }
      setTheoryImport({
        done: result.done,
        total: result.total,
        note:
          `Загружено ${result.done} из ${result.total} картинок.` +
          (result.missing.length > 0
            ? ` Не удалось загрузить: ${result.missing.join(", ")}`
            : ""),
      });
    } catch (error) {
      setTheoryImport({
        done: 0,
        total: 0,
        note: error instanceof Error ? error.message : "Не удалось импортировать папку",
      });
    } finally {
      importBusyRef.current = false;
      setTheoryImporting(false);
    }
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
    <form
      action={formAction}
      onSubmit={(event) => { if (theoryImporting || pendingImport) event.preventDefault(); }}
      className="flex w-full flex-col gap-y-4"
    >
      <input type="hidden" name="id" value={lesson?.id ?? ""} />
      <input
        type="hidden"
        name="contentJson"
        value={JSON.stringify(format === "practice-v1" ? { ...practice, theory } : toContent(theory, questions))}
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
            value={coinReward}
            onChange={(event) => setCoinReward(Number(event.target.value))}
            className={inputClass}
          />
          <span className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCoinReward(5)}>Короткая проверка: 5</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCoinReward(20)}>Практика: 20</Button>
          </span>
        </label>
      </div>

      {contentLocked && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Содержание этой практики закреплено за опубликованным уроком или сохранённым прогрессом. Для новых заданий создай отдельный урок.</p>}
      <fieldset disabled={pending || theoryImporting || contentLocked} className="flex min-w-0 flex-col gap-4">
      <label className="flex flex-col gap-1.5 font-bold text-neutral-700">Формат урока
        <select value={format} disabled={!!lesson || !allowFormatChange || !!pendingImport} className={inputClass} onChange={(event) => setFormat(event.target.value as "classic" | "practice-v1")}>
          <option value="classic">Обычный урок</option>
          <option value="practice-v1">Практика с разбором и повторением</option>
        </select>
        <span className="text-sm font-normal text-neutral-500">Выбери формат до добавления заданий. Для существующего урока формат сохраняется.</span>
      </label>
      <div className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Теория (гайд){" "}
          <span className="font-normal text-neutral-400">(необязательно)</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error нестандартный, но поддерживаемый браузерами атрибут выбора папки
            webkitdirectory=""
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) void importFolder(files);
            }}
          />
          <Button
            type="button"
            variant="secondaryOutline"
            size="sm"
            disabled={pending || theoryImporting || !!pendingImport}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderInput className="mr-2 h-4 w-4" />
            {theoryImporting ? "Импортирую…" : "Импорт из папки"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!!pendingImport} onClick={() => markdownInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />Импорт урока (MD)
          </Button>
          <input ref={markdownInputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMarkdown(file);
          }} />
          {theoryImport && (
            <span role="status" className="break-words text-sm text-neutral-500">
              {theoryImporting
                ? `${theoryImport.note} · ${theoryImport.done}/${theoryImport.total}`
                : theoryImport.note}
            </span>
          )}
        </div>
        {contentLocked ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-neutral-200 p-3 text-sm text-neutral-500">{theory || "Теория не добавлена"}</pre> : <TheoryEditor key={theoryKey} markdown={theory} onChange={(value) => { if (!theoryImporting) setTheory(value); }} />}
        <span className="text-sm text-neutral-400">
          Показывается ученику перед заданиями. Картинки можно перетащить в
          текст или вставить через Ctrl+V - они сами загрузятся в хранилище.
          «Импорт из папки» заменяет теорию из .md-файла и загружает связанные
          картинки. Блок kvantolingo внутри .md также импортирует задания после
          подтверждения. Обычный .md сохраняет текущие вопросы.
          Для картинок с относительными путями используй импорт папки.
        </span>
      </div>

      {format === "practice-v1" ? (
        <PracticeEditor content={practice} onChange={setPractice} />
      ) : (
      <>
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
      </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={!!pendingImport} onClick={() => importInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />Импорт заданий (JSON)
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importQuestions(file);
          }}
        />
      </div>

      {importNote && (
        <p className="rounded-xl bg-sky-50 p-3 text-sm font-medium text-sky-700">
          {importNote}
        </p>
      )}
      {pendingImport && (
        <div role="region" aria-label="Подтверждение импорта" className="flex flex-col gap-3 rounded-xl border-2 border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-medium text-sky-800">Прочитано: {pendingImport.questions.questions.length} основных и {pendingImport.questions.bonusQuestions.length} дополнительных заданий. Формат: {pendingImport.questions.format === "practice-v1" ? "практика" : "обычный урок"}.{pendingImport.theory !== undefined ? " Теория заменится вместе с заданиями." : " Текущая теория сохранится."}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondaryOutline" size="sm" onClick={() => applyQuestionImport("append")}>Добавить задания</Button>
            <Button type="button" variant="dangerOutline" size="sm" onClick={() => applyQuestionImport("replace")}>Заменить все задания</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPendingImport(null)}>Отменить импорт</Button>
          </div>
        </div>
      )}
      </fieldset>

      {state?.error && (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-600">
          {state.error}
        </p>
      )}

      {/* Липкая панель: форма длинная, «Сохранить» должна быть под рукой при любом скролле. */}
      <div className="sticky bottom-0 z-10 -mx-3 mb-6 mt-2 flex items-center gap-x-3 border-t-2 border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
        <Button type="submit" variant="secondary" disabled={pending || theoryImporting || !!pendingImport}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/lessons">Отмена</Link>
        </Button>
      </div>
    </form>
  );
};
