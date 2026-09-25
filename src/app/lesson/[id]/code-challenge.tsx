"use client";

import { useState } from "react";

import { LANGUAGE_LABELS } from "@/lib/code-runner";
import type { CodeLanguage } from "@/lib/lesson-content";
import { diffHint } from "@/lib/output-match";
import { cn } from "@/lib/utils";

type CodeChallengeProps = {
  code: string;
  onChange: (code: string) => void;
  /** Язык задания — влияет на подпись редактора и текст при запуске. */
  language: CodeLanguage;
  /** Вывод последнего запуска (null — ещё не запускали). */
  output: string | null;
  running: boolean;
  status: "correct" | "wrong" | "none";
  /** Ожидаемый вывод задания — для подсказки после неудачных попыток. */
  expectedOutput: string;
  /** Сколько раз проверка этого задания уже провалилась. */
  fails: number;
};

// Редактор кода для задания типа code: textarea с моноширинным шрифтом
// и панель вывода программы под ним. Запуск делает QuestRunner по кнопке
// «Проверить» в футере.
export const CodeChallenge = ({
  code,
  onChange,
  language,
  output,
  running,
  status,
  expectedOutput,
  fails,
}: CodeChallengeProps) => {
  // Первая неудача — подсказка без ответа (номер строки с расхождением),
  // со второй — показываем ожидаемый вывод целиком, чтобы ученик не застрял.
  const hint =
    status === "wrong" && output !== null ? diffHint(output, expectedOutput) : null;
  const showExpected = status === "wrong" && fails >= 2;

  // Вставка в редактор отключена: код-задание — это тренировка рук, а не
  // Ctrl+V из чата с одноклассником. Показываем объяснение при попытке.
  const [pasteTried, setPasteTried] = useState(false);

  return (
    <div className="flex flex-col gap-y-3">
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          setPasteTried(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setPasteTried(true);
        }}
        onKeyDown={(e) => {
          // Tab внутри редактора — отступ (4 пробела), а не уход фокуса.
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd, value } = el;
            const next =
              value.slice(0, selectionStart) + "    " + value.slice(selectionEnd);
            onChange(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = selectionStart + 4;
            });
          }
        }}
        rows={10}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={running || status === "correct"}
        aria-label={`Код на ${LANGUAGE_LABELS[language]}`}
        className={cn(
          "w-full rounded-xl border-2 border-neutral-200 bg-neutral-50 p-4 font-mono text-sm text-neutral-700 outline-none focus:border-sky-300 disabled:opacity-70",
          status === "correct" && "border-green-300 bg-green-50",
          status === "wrong" && "border-rose-200",
        )}
      />

      {pasteTried && (
        <p className="rounded-xl bg-sky-50 p-3 text-sm font-medium text-sky-700">
          ✋ Вставка здесь не работает — программисты тренируют руки. Набери
          код сам, это и есть учёба 😉
        </p>
      )}

      {(running || output !== null) && (
        <div className="rounded-xl bg-neutral-800 p-4 font-mono text-sm text-neutral-100">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-400">
            Вывод программы
          </div>
          {running ? (
            <span className="text-neutral-400">
              {language === "python"
                ? "Выполняем… (первый запуск скачивает Python, ~10 МБ — потом будет мгновенно)"
                : "Выполняем…"}
            </span>
          ) : output === "" ? (
            <span className="text-neutral-400">
              (программа ничего не напечатала — нужен{" "}
              {language === "python" ? "print" : "console.log"})
            </span>
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap">{output}</pre>
          )}
        </div>
      )}

      {hint && !showExpected && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-700">
          💡 {hint}
        </p>
      )}

      {showExpected && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 font-mono text-sm text-neutral-700">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-green-600">
            Так должен выглядеть вывод
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap">
            {expectedOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
