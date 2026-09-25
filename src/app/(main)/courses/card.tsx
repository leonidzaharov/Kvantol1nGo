import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type CardProps = {
  id: number;
  title: string;
  icon: string | null;
  onClick: (id: number) => void;
  disabled?: boolean;
  isActive?: boolean;
};

export const Card = ({
  id,
  title,
  icon,
  onClick,
  disabled,
  isActive,
}: CardProps) => {
  return (
    <div
      onClick={() => onClick(id)}
      className={cn(
        "flex h-full min-h-[217px] min-w-[200px] cursor-pointer flex-col items-center justify-between rounded-xl border-2 border-b-[4px] p-3 pb-6 hover:bg-black/5 active:border-b-2",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex min-h-[24px] w-full items-center justify-end">
        {isActive && (
          <div className="flex items-center justify-center rounded-md bg-green-600 p-1.5">
            <Check className="h-4 w-4 stroke-[4] text-white" />
          </div>
        )}
      </div>

      <div className="flex h-[80px] w-[80px] items-center justify-center rounded-2xl bg-green-100 text-4xl">
        {icon ?? "📚"}
      </div>

      <p className="mt-3 text-center font-bold text-neutral-700">{title}</p>
    </div>
  );
};
