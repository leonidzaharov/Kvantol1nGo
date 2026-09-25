"use client";

import { useTransition } from "react";
import { BadgeCheck } from "lucide-react";

import { setShowcaseAchievement } from "@/lib/actions/achievements";
import { Button } from "@/components/ui/button";

/**
 * Кнопка «Показать в профиле» на открытой ачивке. Выбранная становится
 * витриной (профиль + лидерборд); повторный клик по выбранной — убирает.
 */
export const ShowcaseButton = ({
  achievementId,
  isShowcased,
}: {
  achievementId: number;
  isShowcased: boolean;
}) => {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const fd = new FormData();
      // Пустой id — снять витрину (см. setShowcaseAchievement).
      fd.set("achievementId", isShowcased ? "" : String(achievementId));
      try {
        await setShowcaseAchievement(fd);
      } catch (err) {
        console.error("setShowcaseAchievement failed", err);
      }
    });
  };

  return (
    <Button
      type="button"
      variant={isShowcased ? "secondary" : "secondaryOutline"}
      size="sm"
      disabled={pending}
      onClick={toggle}
    >
      <BadgeCheck className="mr-1.5 h-4 w-4" />
      {isShowcased ? "В профиле" : "Показать в профиле"}
    </Button>
  );
};
