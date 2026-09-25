import { Heart, X } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";

type HeaderProps = {
  hearts: number;
  percentage: number;
  stepLabel?: string;
  exitHref?: string;
};

export const Header = ({
  hearts,
  percentage,
  stepLabel,
  exitHref = "/learn",
}: HeaderProps) => {
  return (
    <header className="mx-auto flex w-full max-w-[1000px] items-center justify-between gap-x-5 px-5 pt-5 sm:px-8 lg:gap-x-8 lg:px-10 lg:pt-8">
      <Link href={exitHref} aria-label="Выйти из урока">
        <X className="cursor-pointer text-slate-500 transition hover:opacity-75" />
      </Link>

      <div className="min-w-0 flex-1">
        {stepLabel && (
          <p className="mb-2 truncate text-xs font-bold uppercase tracking-wide text-neutral-400 sm:text-sm">
            {stepLabel}
          </p>
        )}
        <Progress value={percentage} label="Прогресс урока" />
      </div>

      <div className="flex items-center font-bold text-rose-500">
        <Heart className="mr-2 h-6 w-6 fill-rose-500" />
        {hearts}
      </div>
    </header>
  );
};
