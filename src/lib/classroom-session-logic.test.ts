import { describe, expect, it } from "vitest";

import {
  CLASSROOM_ACTIVE_WINDOW_MS,
  CLASSROOM_CAPTURE_WINDOW_MS,
  classroomActiveCutoff,
  classroomCaptureCutoff,
  isFreshClassroomCapture,
} from "./classroom-session-logic";

describe("classroom pre-session capture", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("принимает действия ученика из текущего учебного блока", () => {
    const startedAt = new Date(now.getTime() - 15 * 60 * 1000);

    expect(isFreshClassroomCapture(startedAt, now)).toBe(true);
  });

  it("не переносит старую работу в новое занятие", () => {
    const startedAt = new Date(
      now.getTime() - CLASSROOM_CAPTURE_WINDOW_MS - 1,
    );

    expect(isFreshClassroomCapture(startedAt, now)).toBe(false);
  });

  it("вычисляет стабильную границу окна", () => {
    expect(classroomCaptureCutoff(now).getTime()).toBe(
      now.getTime() - CLASSROOM_CAPTURE_WINDOW_MS,
    );
  });

  it("оставляет активное занятие открытым ровно на четыре часа", () => {
    expect(classroomActiveCutoff(now).getTime()).toBe(
      now.getTime() - CLASSROOM_ACTIVE_WINDOW_MS,
    );
  });
});
