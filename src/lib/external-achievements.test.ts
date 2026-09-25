import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  "prisma/migrations/20260729190000_add_external_manual_achievements/migration.sql",
  "utf8",
);

const externalAchievementCodes = [
  "TECHNOGTO_PARTICIPANT",
  "TECHNOGTO_GOLD",
  "NTO_PARTICIPANT",
  "NTO_COMPLETED",
  "NTO_FINALIST",
  "CONTEST_FARMER",
  "DIPLOMA_HUNTER",
  "CONTEST_WINNER",
  "MENTOR_RESPECT",
  "KVANTORIUM_AMBASSADOR",
] as const;

describe("каталог внешних ручных достижений", () => {
  it.each(externalAchievementCodes)("%s присутствует в миграции", (code) => {
    expect(migrationSql).toContain(`'${code}'`);
  });

  it("использует только существующую ручную метрику", () => {
    expect(migrationSql.match(/'manual_award'/g)).toHaveLength(11);
    expect(migrationSql).not.toContain("KVANTOLINGO_CREATOR");
  });
});
