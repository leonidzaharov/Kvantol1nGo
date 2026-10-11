"use client";

import { revokeAchievement } from "@/lib/actions/achievements";
import { Button } from "@/components/ui/button";

// «Забрать» ачивку у ученика — для ошибочно выданных. Монеты остаются,
// об этом честно предупреждаем в confirm.
export const RevokeButton = ({
  achievementId,
  achievementTitle,
  userId,
  studentName,
}: {
  achievementId: number;
  achievementTitle: string;
  userId: string;
  studentName: string;
}) => {
  return (
    <form
      action={revokeAchievement}
      onSubmit={(e) => {
        if (
          !confirm(
            `Забрать ачивку «${achievementTitle}» у ${studentName}? Она исчезнет из профиля, монеты останутся.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="achievementId" value={achievementId} />
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="dangerOutline" size="sm">
        Забрать
      </Button>
    </form>
  );
};
