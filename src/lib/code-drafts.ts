// ============================================================
// Черновики кода ученика в localStorage общего компьютера.
//
// Ключ жёстко привязан к профилю: kvanto-code-draft:{userId}:{lessonId}… —
// поэтому второй ученик за тем же компьютером не увидит чужое решение.
// Два уровня защиты:
//  1. При входе в урок стираются черновики ВСЕХ других профилей.
//  2. На общем экране выбора профиля ("/") стираются черновики вообще все —
//     ушедший ученик не оставляет решений следующему.
// ============================================================

const PREFIX = "kvanto-code-draft:";

export function draftKey(
  userId: string,
  lessonId: number,
  section: string,
  index: number,
): string {
  return `${PREFIX}${userId}:${lessonId}:${section}:${index}`;
}

function eachDraftKey(fn: (key: string) => void) {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) fn(key);
    }
  } catch {
    // Приватный режим/запрет localStorage — черновики просто не работают.
  }
}

export function readDraft(
  userId: string,
  lessonId: number,
  section: string,
  index: number,
): string | null {
  try {
    return window.localStorage.getItem(draftKey(userId, lessonId, section, index));
  } catch {
    return null;
  }
}

export function writeDraft(
  userId: string,
  lessonId: number,
  section: string,
  index: number,
  code: string,
): void {
  try {
    window.localStorage.setItem(
      draftKey(userId, lessonId, section, index),
      code,
    );
  } catch {
    // Переполненная квота не должна ломать урок.
  }
}

export function removeDraft(
  userId: string,
  lessonId: number,
  section: string,
  index: number,
): void {
  try {
    window.localStorage.removeItem(draftKey(userId, lessonId, section, index));
  } catch {
    // Необязательная очистка.
  }
}

/** Удаляет все черновики этого ученика по уроку (урок завершён). */
export function clearLessonDrafts(userId: string, lessonId: number): void {
  const prefix = `${PREFIX}${userId}:${lessonId}:`;
  eachDraftKey((key) => {
    if (key.startsWith(prefix)) window.localStorage.removeItem(key);
  });
}

/** Удаляет черновики всех профилей, КРОМЕ текущего. */
export function clearOtherUsersDrafts(userId: string): void {
  const own = `${PREFIX}${userId}:`;
  eachDraftKey((key) => {
    if (!key.startsWith(own)) window.localStorage.removeItem(key);
  });
}

/** Удаляет вообще все черновики (экран выбора профиля, выход). */
export function clearAllDrafts(): void {
  eachDraftKey((key) => window.localStorage.removeItem(key));
}
