"use client";

import { Button } from "@/components/ui/button";
import { deleteGroup } from "@/lib/actions/groups";

export function DeleteGroupButton({
  id,
  name,
  studentCount,
}: {
  id: number;
  name: string;
  studentCount: number;
}) {
  return (
    <form
      action={deleteGroup}
      onSubmit={(event) => {
        const students =
          studentCount > 0
            ? ` Вместе с ней будут окончательно удалены ученики: ${studentCount}, их прогресс, работы и награды.`
            : "";
        if (
          !confirm(
            `Удалить группу «${name}»?${students} Это действие нельзя отменить.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="dangerOutline" size="sm">
        Удалить группу
      </Button>
    </form>
  );
}
