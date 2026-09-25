"use client";

import { useEffect } from "react";
import { CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FooterProps = {
  onCheck: () => void;
  status: "correct" | "wrong" | "none" | "completed";
  disabled?: boolean;
  cooldownSeconds?: number;
  onBack?: () => void;
  backDisabled?: boolean;
  primaryLabel?: string;
};

export const Footer = ({
  onCheck,
  status,
  disabled,
  cooldownSeconds = 0,
  onBack,
  backDisabled = false,
  primaryLabel,
}: FooterProps) => {
  // Enter дублирует основную кнопку — привычно для Duolingo.
  // Но не когда фокус в поле ввода (редактор кода): там Enter — новая строка.
  // И не когда фокус на кнопке (вариант ответа, сама кнопка футера): Enter
  // там кликает нативно, а preventDefault ниже этот клик убил бы — карточку
  // стало бы невозможно выбрать с клавиатуры.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag =
        e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON") return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (!disabled) onCheck();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCheck, disabled]);

  return (
    <footer
      className={cn(
        "h-[100px] border-t-2 lg:h-[140px]",
        status === "correct" && "border-transparent bg-green-100",
        status === "wrong" && "border-transparent bg-rose-100",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1000px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        {onBack && status === "completed" && (
          <Button
            type="button"
            variant="default"
            size="lg"
            disabled={backDisabled}
            onClick={onBack}
          >
            Назад
          </Button>
        )}

        {status === "correct" && (
          <div className="flex items-center text-base font-bold text-green-500 lg:text-2xl">
            <CheckCircle className="mr-4 h-6 w-6 lg:h-10 lg:w-10" />
            Отлично!
          </div>
        )}

        {status === "wrong" && (
          <div
            className="flex items-center text-base font-bold text-rose-500 lg:text-2xl"
            aria-live="polite"
          >
            <XCircle className="mr-4 h-6 w-6 lg:h-10 lg:w-10" />
            {cooldownSeconds > 0
              ? `Остановись и проверь ответ: ${cooldownSeconds} сек.`
              : "Теперь попробуй ещё раз."}
          </div>
        )}

        <Button
          disabled={disabled}
          aria-disabled={disabled}
          className="ml-auto"
          onClick={onCheck}
          size="lg"
          variant={status === "wrong" ? "danger" : "secondary"}
        >
          {status === "none" && "Проверить"}
          {status === "correct" && "Далее"}
          {status === "wrong" &&
            (cooldownSeconds > 0
              ? `Снова через ${cooldownSeconds} сек.`
              : "Попробовать снова")}
          {status === "completed" && (primaryLabel ?? "Продолжить")}
        </Button>
      </div>
    </footer>
  );
};
