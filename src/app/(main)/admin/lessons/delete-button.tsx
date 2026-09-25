"use client";

import { deleteLesson } from "@/lib/actions/lessons";
import { Button } from "@/components/ui/button";

// Кнопка «Удалить» в списке уроков. confirm предупреждает, что вместе с
// уроком сотрётся и прогресс учеников по нему.
export const DeleteLessonButton = ({
  id,
  title,
}: {
  id: number;
  title: string;
}) => {
  return (
    <form
      action={deleteLesson}
      onSubmit={(e) => {
        if (
          !confirm(
            `Удалить урок «${title}»? Прогресс учеников по нему тоже сотрётся. Это действие не отменить.`,
          )
        ) {
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
