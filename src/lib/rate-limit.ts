// ============================================================
// Простой лимитер частоты запросов «в памяти процесса» (fixed window).
//
// Вход защищён отдельно, через БД (LoginAttempt в auth.ts). Здесь — лёгкая
// защита прочих действий (загрузка картинок и т.п.) от случайного/намеренного
// спама. Best-effort: состояние живёт в памяти инстанса, на нескольких
// serverless-инстансах Vercel лимит считается по каждому отдельно. Для нашей
// маленькой аудитории этого достаточно; понадобится строгий общий лимит —
// вынести в БД/Upstash Redis.
// ============================================================

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * true — запрос в пределах лимита (можно продолжать); false — лимит исчерпан.
 * @param key     что ограничиваем (например `upload:<userId>`)
 * @param max     сколько запросов разрешено в окне
 * @param windowMs длина окна в миллисекундах
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) {
    return false;
  }
  bucket.count += 1;
  return true;
}
