// Чистая логика геймификации — без БД, без побочных эффектов, без "use server".
// Вынесена сюда из gamification.ts, чтобы её можно было покрыть юнит-тестами
// (файл с "use server" разрешает экспортировать только async-функции).
// Server action gamification.ts импортирует эти функции и применяет их к БД.

export const XP_PER_LEVEL = 100;

/** Уровень ученика из общего опыта. Уровень 1 — стартовый (0..99 XP). */
export function calculateLevel(totalXp: number): number {
  return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}

type LessonContent = {
  questions?: unknown[];
};

/** Сколько вопросов в JSON-контенте урока. Кривой JSON → 0 (без падения). */
export function countQuestions(content: string): number {
  try {
    const parsed = JSON.parse(content) as LessonContent;
    return Array.isArray(parsed.questions) ? parsed.questions.length : 0;
  } catch {
    return 0;
  }
}
