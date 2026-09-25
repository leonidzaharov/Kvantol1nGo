import { NotebookText } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type UnitBannerProps = {
  title: string;
  description: string;
  /** id урока, с которого продолжать. null — все уроки пройдены. */
  continueLessonId: number | null;
};

export const UnitBanner = ({
  title,
  description,
  continueLessonId,
}: UnitBannerProps) => {
  return (
    <div className="flex w-full items-center justify-between rounded-xl bg-green-500 p-5 text-white">
      <div className="space-y-2.5">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="text-lg">{description}</p>
      </div>

      {continueLessonId !== null && (
        <Link href={`/lesson/${continueLessonId}`}>
          <Button
            size="lg"
            variant="secondary"
            className="hidden border-2 border-b-4 active:border-b-2 xl:flex"
          >
            <NotebookText className="mr-2" />
            Продолжить
          </Button>
        </Link>
      )}
    </div>
  );
};
