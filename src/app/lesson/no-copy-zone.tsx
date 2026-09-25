"use client";

import { useEffect, type PropsWithChildren } from "react";

/**
 * Обёртка экрана урока: глушит копирование, вырезание и контекстное меню —
 * лёгкий барьер от «скопировал вопрос → кинул в чат». Это именно барьер от
 * соблазна, а не сейф: настоящая защита в том, что ответов в браузере
 * больше нет (sanitizeLessonContent + server action checkAnswer).
 *
 * Выделение текста НЕ отключаем: ученику надо выделять свой код в редакторе.
 */
export function NoCopyZone({ children }: PropsWithChildren) {
  // Пасхалка любопытным: F12 заблокировать нельзя (и не нужно), но пусть
  // заглянувший в консоль узнает, что искать тут нечего.
  useEffect(() => {
    console.log(
      "%cПодглядываешь? 😏 Ответов здесь больше нет — их знает только сервер.",
      "font-size: 14px; font-weight: bold; color: #58cc02;",
    );
  }, []);

  const block = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div
      className="flex h-full w-full flex-col"
      onCopy={block}
      onCut={block}
      onContextMenu={block}
    >
      {children}
    </div>
  );
}
