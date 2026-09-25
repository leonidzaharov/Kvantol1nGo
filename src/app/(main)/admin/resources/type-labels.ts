import type { ResourceType } from "@/generated/prisma";

// Русские подписи типов материала — общие для списка и формы админки.
export const TYPE_LABELS: Record<ResourceType, string> = {
  video: "Видео (YouTube)",
  scratch: "Проект Scratch",
  article: "Ссылка",
  note: "Совет наставника",
};
