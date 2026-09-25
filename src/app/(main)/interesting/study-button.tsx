"use client";

import { useTransition } from "react";
import { CheckCircle2, Coins } from "lucide-react";

import { studyResource } from "@/lib/actions/study";
import { Button } from "@/components/ui/button";

type StudyButtonProps = {
  resourceId: number;
  coinReward: number;
  /** Уже отмечен изученным — показываем бейдж вместо кнопки. */
  studied: boolean;
};

// Кнопка «Изучил»: одноразово начисляет монеты материала. После нажатия
// сервер ревалидирует /interesting, и кнопка сменится бейджем «Изучено».
export const StudyButton = ({
  resourceId,
  coinReward,
  studied,
}: StudyButtonProps) => {
  const [pending, startTransition] = useTransition();

  if (studied) {
    return (
      <span className="mt-4 inline-flex items-center gap-x-1.5 self-start font-bold text-green-600">
        <CheckCircle2 className="h-5 w-5" />
        Изучено
      </span>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="mt-4 self-start"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await studyResource(resourceId).catch((err) =>
            console.error("studyResource failed", err),
          );
        });
      }}
    >
      {pending ? (
        "Засчитываю…"
      ) : (
        <>
          Изучил
          <span className="ml-2 inline-flex items-center gap-x-0.5 text-amber-100">
            +{coinReward}
            <Coins className="h-4 w-4" />
          </span>
        </>
      )}
    </Button>
  );
};
