import type { ResourceFormType } from "@/lib/resource-practice";

// Русские подписи типов материала — общие для списка и формы админки.
export const TYPE_LABELS: Record<ResourceFormType, string> = {
  video: "Видео (YouTube)",
  scratch: "Проект Scratch",
  article: "Ссылка",
  note: "Совет наставника",
  practice: "Интерактивная практика",
};
