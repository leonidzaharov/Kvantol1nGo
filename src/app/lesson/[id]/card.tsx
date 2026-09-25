"use client";

import { cn } from "@/lib/utils";

type CardProps = {
  text: string;
  shortcut: string;
  selected?: boolean;
  onClick: () => void;
  status: "correct" | "wrong" | "none";
  disabled?: boolean;
};

// Карточка варианта ответа. Цвет рамки/текста зависит от выбора и статуса
// проверки (sky — выбран, green — верно, rose — неверно).
export const Card = ({
  text,
  shortcut,
  selected,
  onClick,
  status,
  disabled,
}: CardProps) => {
  return (
    // Настоящая <button>, а не кликабельный div: вариант ответа должен
    // нажиматься с клавиатуры и объявляться скринридером как кнопка.
    // aria-pressed передаёт выбранное состояние (визуально это цвет рамки).
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      aria-pressed={selected ?? false}
      className={cn(
        "h-full w-full cursor-pointer rounded-xl border-2 border-b-4 p-4 text-left hover:bg-black/5 active:border-b-2 lg:p-6",
        selected && "border-sky-300 bg-sky-100 hover:bg-sky-100",
        selected &&
          status === "correct" &&
          "border-green-300 bg-green-100 hover:bg-green-100",
        selected &&
          status === "wrong" &&
          "border-rose-300 bg-rose-100 hover:bg-rose-100",
        disabled && "pointer-events-none hover:bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-x-4">
        <p
          className={cn(
            "text-sm text-neutral-600 lg:text-base",
            selected && "text-sky-500",
            selected && status === "correct" && "text-green-500",
            selected && status === "wrong" && "text-rose-500",
          )}
        >
          {text}
        </p>

        {/* Номер варианта — визуальная подсказка; для скринридера это шум,
            поэтому прячем: имя кнопки должно быть просто текстом ответа. */}
        <div
          aria-hidden="true"
          className={cn(
            "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-lg border-2 text-xs font-semibold text-neutral-400 lg:h-[30px] lg:w-[30px] lg:text-[15px]",
            selected && "border-sky-300 text-sky-500",
            selected &&
              status === "correct" &&
              "border-green-500 text-green-500",
            selected && status === "wrong" && "border-rose-500 text-rose-500",
          )}
        >
          {shortcut}
        </div>
      </div>
    </button>
  );
};
