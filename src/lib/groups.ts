import type { GroupTrack } from "@/generated/prisma";

// Русские подписи направлений — общие для экрана входа и админки групп.
export const TRACK_LABELS: Record<GroupTrack, string> = {
  intro: "Вводный",
  advanced: "Углублённый",
  project: "Проектный",
};

// Порядок показа направлений (от простого к сложному).
export const TRACK_ORDER: GroupTrack[] = ["intro", "advanced", "project"];
