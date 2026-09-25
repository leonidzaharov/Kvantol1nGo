import { ExternalLink, Lightbulb, Play, Puzzle, type LucideIcon } from "lucide-react";

import type { Resource, ResourceType } from "@/generated/prisma";
import { cn } from "@/lib/utils";

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

export function ResourceCard({
  resource,
  studied,
}: {
  resource: Resource;
  studied: boolean;
}) {
  const meta = TYPE_META[resource.type];
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

      <CardBody resource={resource} />

      <StudyButton
        resourceId={resource.id}
        coinReward={resource.coinReward}
        studied={studied}
      />
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
