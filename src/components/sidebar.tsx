import Link from "next/link";
import { LogOut } from "lucide-react";

import { auth, signOut } from "@/auth";
import { getSidebarData } from "@/lib/sidebar-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { SidebarItem } from "./sidebar-item";

type SidebarProps = {
  className?: string;
};

// Async server-component: сам достаёт текущего пользователя из сессии
// (next-auth), как и остальной серверный код проекта.
export const Sidebar = async ({ className }: SidebarProps) => {
  const session = await auth();

  // Пункт «Админка» видит только наставник. Флаг читаем из БД, а не из
  // JWT, чтобы права действовали сразу (сессия живёт до 8 часов).
  const userId = session?.user?.id;
  const sidebarData = userId
    ? await getSidebarData(userId)
    : {
      isAdmin: false,
      name: "Ученик",
        hasReviewAssignments: false,
        revisionRequestCount: 0,
      };
  const { isAdmin, name, hasReviewAssignments, revisionRequestCount } = sidebarData;

  return (
    <div
      className={cn(
        "left-0 top-0 flex h-full flex-col border-r-2 px-4 lg:fixed lg:w-[256px]",
        className,
      )}
    >
      <Link href="/learn">
        <div className="flex items-center gap-x-3 pb-7 pl-4 pt-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500 text-xl font-extrabold text-white">
            К
          </div>
          <h1 className="text-2xl font-extrabold tracking-wide text-green-600">
            Кванториум
          </h1>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-y-2">
        <SidebarItem label="Учить" href="/learn" icon="learn" />
        <SidebarItem label="Курсы" href="/courses" icon="courses" />
        <SidebarItem label="Лидерборд" href="/leaderboard" icon="leaderboard" />
        <SidebarItem label="Интересное" href="/interesting" icon="interesting" />
        {hasReviewAssignments ? (
          <SidebarItem
            label="Мои работы"
            href="/works"
            icon="works"
            badge={revisionRequestCount}
          />
        ) : null}
        <SidebarItem label="Достижения" href="/achievements" icon="trophy" />
        <SidebarItem label="Профиль" href="/profile" icon="profile" />
        {isAdmin && (
          <SidebarItem label="Админка" href="/admin/lessons" icon="admin" />
        )}
      </div>

      <div className="flex items-center justify-between gap-x-2 p-4">
        <span className="truncate font-bold text-neutral-700">{name}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Выйти"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};
