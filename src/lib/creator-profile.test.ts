import { describe, expect, it } from "vitest";

import {
  buildLeaderboardEntries,
  CREATOR_ACHIEVEMENT,
  CREATOR_LEADERBOARD_ENTRY,
  CREATOR_REGALIA,
} from "./creator-profile";

describe("системная запись создателя", () => {
  const students = [
    { id: "student-a", name: "Аня", totalXp: 500 },
    { id: "student-b", name: "Борис", totalXp: 300 },
  ];

  it("всегда стоит первой и не сдвигает места учеников", () => {
    const entries = buildLeaderboardEntries(students, "student-a");

    expect(entries[0]).toBe(CREATOR_LEADERBOARD_ENTRY);
    expect(entries.slice(1).map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it("не маскируется под ученика и ведёт только на /creator", () => {
    expect(CREATOR_LEADERBOARD_ENTRY.isSystemEntry).toBe(true);
    expect(CREATOR_LEADERBOARD_ENTRY.href).toBe("/creator");
    expect(CREATOR_LEADERBOARD_ENTRY).not.toHaveProperty("totalXp");
    expect(CREATOR_LEADERBOARD_ENTRY.href).not.toContain(
      `/profile/${CREATOR_LEADERBOARD_ENTRY.id}`,
    );
  });

  it("системная ачивка не имеет награды и не является ручной", () => {
    expect(CREATOR_ACHIEVEMENT.isSystemOnly).toBe(true);
    expect(CREATOR_ACHIEVEMENT.rewardCurrency).toBe(0);
    expect(CREATOR_ACHIEVEMENT).not.toHaveProperty("metric");
  });

  it("показывает пять утверждённых регалий", () => {
    expect(CREATOR_REGALIA).toHaveLength(5);
    expect(CREATOR_REGALIA.map((item) => item.label)).toEqual([
      "Создатель KvantoLingo",
      "Архитектор платформы",
      "Наставник Кванториума",
      "Founder Edition",
      "Mythic Profile",
    ]);
  });
});
