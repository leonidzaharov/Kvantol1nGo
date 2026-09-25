"use client";

import { deleteResource } from "@/lib/actions/resources";
import { Button } from "@/components/ui/button";

// Кнопка «Удалить» в списке материалов: обычная форма с server action,
// но с браузерным confirm — случайный клик не должен сносить материал.
export const DeleteButton = ({ id, title }: { id: number; title: string }) => {
  return (
    <form
      action={deleteResource}
      onSubmit={(e) => {
        if (!confirm(`Удалить «${title}»? Это действие не отменить.`)) {
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
