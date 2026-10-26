import type { ResourceType } from "@/generated/prisma";

export type ResourceFormType = ResourceType | "practice";

/** Only an explicit internal lesson path represents a linked practice. */
export function parsePracticeLessonId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^\/lesson\/(\d{1,7})\/?$/.exec(value.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 && id <= 1_000_000 ? id : null;
}

export function resourcePracticeLessonId(resource: { type: ResourceType; url: string | null }): number | null {
  return resource.type === "article" ? parsePracticeLessonId(resource.url) : null;
}

export function resourceFormType(resource: { type: ResourceType; url: string | null }): ResourceFormType {
  return resourcePracticeLessonId(resource) === null ? resource.type : "practice";
}
