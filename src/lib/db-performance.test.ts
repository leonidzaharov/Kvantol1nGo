import { describe, expect, it } from "vitest";

import {
  formatSlowQueryWarning,
  getSlowQueryThresholdMs,
} from "./db-performance";

describe("getSlowQueryThresholdMs", () => {
  it("использует безопасное значение по умолчанию", () => {
    expect(getSlowQueryThresholdMs(undefined)).toBe(500);
    expect(getSlowQueryThresholdMs("не число")).toBe(500);
  });

  it("ограничивает слишком маленькие и большие значения", () => {
    expect(getSlowQueryThresholdMs("1")).toBe(50);
    expect(getSlowQueryThresholdMs("999999")).toBe(60_000);
    expect(getSlowQueryThresholdMs("450.4")).toBe(450);
  });
});

describe("formatSlowQueryWarning", () => {
  it("не журналирует быстрый запрос", () => {
    expect(
      formatSlowQueryWarning(
        {
          duration: 299,
          query: 'SELECT "public"."User"."id" FROM "public"."User"',
          target: "quaint::connector::metrics",
        },
        300,
      ),
    ).toBeNull();
  });

  it("оставляет только длительность, операцию и таблицы", () => {
    const warning = formatSlowQueryWarning(
      {
        duration: 412.7,
        query:
          'SELECT "public"."User"."id" FROM "public"."User" INNER JOIN "public"."Group" ON 1=1 WHERE "public"."User"."name" = $1',
        target: "quaint::connector::metrics",
      },
      300,
    );

    expect(warning).toContain('"durationMs":413');
    expect(warning).toContain('"operation":"SELECT"');
    expect(warning).toContain('"relations":["User","Group"]');
    expect(warning).not.toContain("params");
    expect(warning).not.toContain("name");
  });
});
