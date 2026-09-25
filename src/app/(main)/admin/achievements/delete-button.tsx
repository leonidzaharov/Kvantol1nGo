"use client";

import { deleteAchievement } from "@/lib/actions/achievements";
import { Button } from "@/components/ui/button";

// Кнопка «Удалить» ачивки. Прогресс учеников по ней уйдёт вместе с ней
// (cascade), уже выданные монеты остаются — предупреждаем в confirm.
export const DeleteButton = ({
  id,
  title,
  unlockedCount,
}: {
  id: number;
  title: string;
  unlockedCount: number;
}) => {
  return (
    <form
      action={deleteAchievement}
      onSubmit={(e) => {
        const warning =
          unlockedCount > 0
            ? `Удалить ачивку «${title}»? Её уже открыли ${unlockedCount} учеников — у них она пропадёт (монеты останутся).`
            : `Удалить ачивку «${title}»? Это действие не отменить.`;
        if (!confirm(warning)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="dangerOutline" size="sm">
        Удалить
      </Button>
    </form>
  );
};
