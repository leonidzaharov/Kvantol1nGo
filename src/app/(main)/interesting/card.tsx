import Link from "next/link";
import { BookOpen, CheckCircle2, ExternalLink, Lightbulb, Play, Puzzle, type LucideIcon } from "lucide-react";

import type { Resource, ResourceType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { resourcePracticeLessonId } from "@/lib/resource-practice";
import { Button } from "@/components/ui/button";

import { StudyButton } from "./study-button";

// Иконка + подпись + цвет бейджа для каждого типа материала.
const TYPE_META: Record<ResourceType, { icon: LucideIcon; label: string; color: string }> = {
  scratch: { icon: Puzzle, label: "Scratch", color: "bg-orange-400" },
  video: { icon: Play, label: "Видео", color: "bg-red-400" },
  article: { icon: ExternalLink, label: "Ссылка", color: "bg-sky-400" },
  note: { icon: Lightbulb, label: "Совет", color: "bg-green-500" },
};

// Встроенные плееры (iframe) занимают всю ширину карточки — поэтому такие
// карточки растягиваем на 2 колонки на десктопе.
const isEmbed = (type: ResourceType) => type === "video" || type === "scratch";

export type PracticeLinkState = {
  available: boolean;
  completed: boolean;
  coinReward: number;
  preview: boolean;
  error?: string;
};

export function ResourceCard({
  resource,
  studied,
  practice,
}: {
  resource: Resource;
  studied: boolean;
  practice?: PracticeLinkState;
}) {
  const lessonId = resourcePracticeLessonId(resource);
  const meta = lessonId === null ? TYPE_META[resource.type] : { icon: BookOpen, label: "Практика", color: "bg-purple-500" };
  const Icon = meta.icon;

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border-2 border-neutral-200 p-5",
        isEmbed(resource.type) && "sm:col-span-2",
      )}
    >
      {/* Шапка: бейдж типа + заголовок */}
      <div className="mb-3 flex items-center gap-x-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white",
            meta.color,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            {meta.label}
          </span>
          <h3 className="truncate text-lg font-bold text-neutral-700">
            {resource.title}
          </h3>
        </div>
      </div>

      {resource.description && (
        <p className="mb-3 text-sm text-neutral-500">{resource.description}</p>
      )}

      {lessonId !== null ? (
        practice?.available ? <div className="mt-auto space-y-3">
          {practice.completed && <p className="flex items-center gap-2 text-sm font-bold text-green-600"><CheckCircle2 className="h-4 w-4" />Пройдено</p>}
          <p className="text-sm text-neutral-500">
            {practice.preview ? "Предпросмотр не меняет прогресс и монеты."
              : practice.completed ? "Повторение без повторной награды."
                : practice.coinReward > 0 ? `${practice.coinReward} монет за первое прохождение.` : "Практика без монет."}
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link prefetch={false} href={practice.preview ? `/lesson/${lessonId}/preview` : `/lesson/${lessonId}`}>
              {practice.preview ? "Предпросмотр практики" : practice.completed ? "Повторить практику" : "Пройти практику"}
            </Link>
          </Button>
        </div> : <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {practice?.error ?? "Связанная практика пока недоступна."}
        </p>
      ) : <>
        <CardBody resource={resource} />
        <StudyButton
        resourceId={resource.id}
        coinReward={resource.coinReward}
        studied={studied}
        />
      </>}
    </article>
  );
}

// Тело карточки — своё на каждый тип.
function CardBody({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case "video":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${resource.url}`}
            title={resource.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );

    case "scratch":
      return (
        <div className="w-full overflow-hidden rounded-xl border-2 border-neutral-200">
          <iframe
            className="h-[402px] w-full"
            src={`https://scratch.mit.edu/projects/${resource.url}/embed`}
            title={resource.title}
            loading="lazy"
            allowFullScreen
          />
        </div>
      );

    case "article":
      return (
        <a
          href={resource.url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-x-1.5 self-start rounded-xl bg-sky-100 px-4 py-2 font-bold text-sky-600 transition hover:bg-sky-200"
        >
          Открыть
          <ExternalLink className="h-4 w-4" />
        </a>
      );

    case "note":
      return (
        <p className="rounded-xl bg-green-50 p-4 text-neutral-700">
          {resource.body}
        </p>
      );
  }
}
