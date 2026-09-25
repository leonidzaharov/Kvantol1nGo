import { describe, expect, it } from "vitest";

import { getAchievementPresentation } from "./achievement-presentation";

describe("getAchievementPresentation", () => {
  const secret = {
    title: "Пасхалка",
    description: "Найди скрытый объект на странице.",
    isHidden: true,
    hiddenHint: "Исследуй приложение внимательнее.",
  };

  it("не раскрывает название и условие закрытого секретного достижения", () => {
    const presentation = getAchievementPresentation({
      ...secret,
      isUnlocked: false,
    });

    expect(presentation).toEqual({
      title: "???",
      description: "Исследуй приложение внимательнее.",
      isSecret: true,
    });
    expect(JSON.stringify(presentation)).not.toContain(secret.title);
    expect(JSON.stringify(presentation)).not.toContain(secret.description);
  });

  it("показывает полные данные после разблокировки", () => {
    expect(
      getAchievementPresentation({
        ...secret,
        isUnlocked: true,
      }),
    ).toEqual({
      title: secret.title,
      description: secret.description,
      isSecret: false,
    });
  });
});
