"use client";

import { Check, Crown, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LessonButtonProps = {
  id: number;
  index: number;
  totalCount: number;
  locked?: boolean;
  current?: boolean;
  percentage: number;
};

// Лёгкое кольцо прогресса на SVG — без зависимости react-circular-progressbar.
const ProgressRing = ({
  percentage,
  children,
}: {
  percentage: number;
  children: ReactNode;
}) => {
  const size = 102;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Number.isNaN(percentage)
    ? 0
    : Math.max(0, Math.min(100, percentage));
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative h-[102px] w-[102px]">
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#4ade80"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
};

export const LessonButton = ({
  id,
  index,
  totalCount,
  locked,
  current,
  percentage,
}: LessonButtonProps) => {
  // Змейка: смещение кнопки вправо по синусоидальному циклу из 8 шагов.
  const cycleLength = 8;
  const cycleIndex = index % cycleLength;

  let indentationLevel;
  if (cycleIndex <= 2) indentationLevel = cycleIndex;
  else if (cycleIndex <= 4) indentationLevel = 4 - cycleIndex;
  else if (cycleIndex <= 6) indentationLevel = 4 - cycleIndex;
  else indentationLevel = cycleIndex - 8;

  const rightPosition = indentationLevel * 40;

  const isFirst = index === 0;
  const isLast = index === totalCount;
  const isCompleted = !current && !locked;
  const lessonLabel = current
    ? `Начать урок ${index + 1}`
    : isCompleted
      ? `Повторить урок ${index + 1}`
      : `Открыть урок ${index + 1}`;

  const Icon = isCompleted ? Check : isLast ? Crown : Star;

  const button = (
    <Button
      size="rounded"
      variant={locked ? "locked" : "secondary"}
      className="h-[70px] w-[70px] border-b-8"
      aria-label={lessonLabel}
    >
      <Icon
        className={cn(
          "h-10 w-10",
          locked
            ? "fill-neutral-400 stroke-neutral-400 text-neutral-400"
            : "fill-primary-foreground text-primary-foreground",
          isCompleted && "fill-none stroke-[4]",
        )}
      />
    </Button>
  );

  const content = (
    <div
      className="relative"
      style={{
        right: `${rightPosition}px`,
        marginTop: isFirst && !isCompleted ? 60 : 24,
      }}
    >
      {current ? (
        <div className="relative h-[102px] w-[102px]">
          <div className="absolute -top-6 left-2.5 z-10 animate-bounce rounded-xl border-2 bg-white px-3 py-2.5 text-sm font-bold uppercase tracking-wide text-green-500">
            Начать
            <div
              className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-white"
              aria-hidden
            />
          </div>
          <ProgressRing percentage={percentage}>{button}</ProgressRing>
        </div>
      ) : (
        button
      )}
    </div>
  );

  // Заблокированный урок — не ссылка.
  if (locked) {
    return (
      <div aria-disabled className="cursor-default">
        {content}
      </div>
    );
  }

  return (
    <Link href={`/lesson/${id}`} aria-label={lessonLabel}>
      {content}
    </Link>
  );
};
