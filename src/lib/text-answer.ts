/**
 * Нормализация применяется только к свободным текстовым ответам.
 * Код и вывод программ проверяются отдельным механизмом.
 */
export function normalizeTextAnswer(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/\p{P}+$/gu, "")
    .trim();
}

export function textAnswersMatch(answer: string, expected: string): boolean {
  const normalizedAnswer = normalizeTextAnswer(answer);
  return (
    normalizedAnswer.length > 0 &&
    normalizedAnswer === normalizeTextAnswer(expected)
  );
}
