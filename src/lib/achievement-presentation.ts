const DEFAULT_SECRET_HINT =
  "Секретное достижение. Продолжай заниматься — условие откроется позже.";

export type AchievementPresentationInput = {
  title: string;
  description: string;
  isHidden: boolean;
  isUnlocked: boolean;
  hiddenHint: string | null;
};

export type AchievementPresentation = {
  title: string;
  description: string;
  isSecret: boolean;
};

export function getAchievementPresentation({
  title,
  description,
  isHidden,
  isUnlocked,
  hiddenHint,
}: AchievementPresentationInput): AchievementPresentation {
  if (isHidden && !isUnlocked) {
    return {
      title: "???",
      description: hiddenHint?.trim() || DEFAULT_SECRET_HINT,
      isSecret: true,
    };
  }

  return {
    title,
    description,
    isSecret: false,
  };
}
