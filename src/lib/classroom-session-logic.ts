/** Ранний вход относится к текущему очному занятию только в пределах одного учебного блока. */
export const CLASSROOM_CAPTURE_WINDOW_MS = 4 * 60 * 60 * 1000;
export const CLASSROOM_ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

export function classroomCaptureCutoff(now: Date): Date {
  return new Date(now.getTime() - CLASSROOM_CAPTURE_WINDOW_MS);
}

export function classroomActiveCutoff(now: Date): Date {
  return new Date(now.getTime() - CLASSROOM_ACTIVE_WINDOW_MS);
}

export function isFreshClassroomCapture(
  startedAt: Date,
  now: Date,
): boolean {
  return startedAt >= classroomCaptureCutoff(now) && startedAt <= now;
}
