// ============================================================
// «Мягкое» сравнение вывода программы ученика с ожидаемым.
//
// Посимвольное равенство слишком строгое для школьников: двойной пробел,
// «ёлочки» вместо прямых кавычек или ё/е давали «неверно» за решённую по
// сути задачу. Нормализуем оба текста и сравниваем уже их.
//
// Что прощаем: виды кавычек и тире, лишние пробелы ВНУТРИ строки, пробелы
// по краям строк, пустые строки в начале/конце, ё/е, \r\n.
// Что НЕ прощаем: регистр букв, слова, цифры, порядок и число строк —
// это уже смысл ответа.
// ============================================================

const QUOTES = /["«»„“”‚‘’]/g;
const DASHES = /[—–−]/g;

export function normalizeOutput(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(QUOTES, "'")
    .replace(DASHES, "-")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  // Пустые строки по краям — в мусор (внутри оставляем: там они смысловые).
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === "") start += 1;
  while (end > start && lines[end - 1] === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

/** true — вывод совпадает с ожидаемым с точностью до нормализации. */
export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

/**
 * Короткая подсказка для ученика, ЧЕМ вывод отличается от ожидаемого —
 * без раскрытия самого ответа (номер строки, а не её текст).
 * Для совпадающих текстов возвращает null.
 */
export function diffHint(actual: string, expected: string): string | null {
  const a = normalizeOutput(actual).split("\n");
  const e = normalizeOutput(expected).split("\n");
  if (a.length !== e.length) {
    return `В выводе ${a.length} ${pluralLines(a.length)}, а ожидается ${e.length}.`;
  }
  for (let i = 0; i < e.length; i += 1) {
    if (a[i] !== e[i]) {
      return e.length === 1
        ? "Текст вывода не совпадает с ожидаемым — сверь каждый символ."
        : `Не совпадает строка ${i + 1} — сверь её с заданием посимвольно.`;
    }
  }
  return null;
}

function pluralLines(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "строка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "строки";
  return "строк";
}
