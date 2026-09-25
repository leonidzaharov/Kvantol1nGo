"use client";

import { deleteCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";

// Удаление курса вместе с уроками требует явного подтверждения.
export const DeleteButton = ({
  id,
  name,
  lessonCount,
}: {
  id: number;
  name: string;
  lessonCount: number;
}) => {
  return (
    <form
      action={deleteCategory}
      onSubmit={(e) => {
        const details =
          lessonCount > 0
            ? `\n\nБудут удалены уроки: ${lessonCount}, а также прогресс учеников по ним.`
            : "";
        if (
          !confirm(
            `Удалить курс «${name}»?${details}\n\nЭто действие не отменить.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="dangerOutline"
        size="sm"
      >
        Удалить
      </Button>
    </form>
  );
};
