import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  id: number;
  isPublished: boolean;
  action: (formData: FormData) => Promise<void>;
  children?: ReactNode;
};

export function PublicationControl({
  id,
  isPublished,
  action,
  children,
}: Props) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input
        type="hidden"
        name="isPublished"
        value={String(!isPublished)}
      />
      <Button
        type="submit"
        size="sm"
        variant={isPublished ? "dangerOutline" : "secondary"}
      >
        {children ?? (isPublished ? "Снять с публикации" : "Опубликовать")}
      </Button>
    </form>
  );
}
