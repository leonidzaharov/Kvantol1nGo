import { cn } from "@/lib/utils";

type ProgressProps = {
  /** Заполнение 0..100. */
  value: number;
  /** Понятное назначение для screen reader, например «Прогресс урока». */
  label: string;
  className?: string;
};

// Лёгкий прогресс-бар в стиле Duolingo (без Radix). Зелёная заливка по ширине.
export const Progress = ({ value, label, className }: ProgressProps) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-3 w-full overflow-hidden rounded-full bg-neutral-200",
        className,
      )}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-green-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
