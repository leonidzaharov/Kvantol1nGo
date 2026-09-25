import { StudentAvatar } from "@/components/student-avatar";
import { Crown, Medal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildLeaderboardEntries } from "@/lib/creator-profile";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";



export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  // Топ по XP; тай-брейк — дата регистрации (кто раньше дошёл, тот выше).
  const users = await prisma.user.findMany({
    where: { isAdmin: false }, // наставник не соревнуется и не светится
    orderBy: [{ totalXp: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true, avatarId: true,
      totalXp: true,
      // Ачивка-витрина — эмодзи рядом с именем.
      showcaseAchievement: {
        select: { title: true, icon: true, rarity: true },
      },
    },
    take: 10,
  });
  const entries = buildLeaderboardEntries(users, userId);

  return (
    <div className="px-3">
      <div className="flex w-full flex-col items-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-400 text-white">
          <Medal className="h-10 w-10" />
        </div>

        <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
          Лидерборд
        </h1>
        <p className="mb-6 text-center text-neutral-500">
          Сравни свой прогресс с другими учениками.
        </p>

        <div className="w-full max-w-[600px]">
          {entries.map((entry) => {
            if (entry.isSystemEntry) {
              return (
                <Link
                  key={entry.id}
                  href={entry.href}
                  className="creator-leaderboard achievement-rarity mb-3 flex w-full items-center gap-3 rounded-2xl border-2 p-3 sm:p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  data-rarity="mythic"
                  aria-label={`${entry.name}, ${entry.subtitle}, XP бесконечность`}
                >
                  <div className="hidden w-6 shrink-0 justify-center text-violet-500 sm:flex">
                    <Crown className="h-6 w-6 fill-amber-300 stroke-violet-600" />
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 text-2xl text-white shadow-sm">
                    👑
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="creator-leaderboard-name font-extrabold text-violet-800">
                      {entry.name}
                    </p>
                    <p className="creator-leaderboard-subtitle mt-1 text-xs font-bold text-violet-500">
                      {entry.subtitle}
                    </p>
                  </div>
                  <p className="shrink-0 font-extrabold text-violet-600">
                    {entry.xpLabel} XP
                  </p>
                </Link>
              );
            }

            const u = entry;
            const i = u.rank - 1;
            const isMe = u.id === userId;
            const rankColor =
              i === 0
                ? "text-amber-500"
                : i === 1
                  ? "text-neutral-400"
                  : i === 2
                    ? "text-orange-700"
                    : "text-neutral-500";

            return (
              // Строка — ссылка на профиль: свой ведёт на /profile,
              // чужой — на /profile/[id].
              <Link
                key={u.id}
                href={isMe ? "/profile" : `/profile/${u.id}`}
                className={cn(
                  "flex w-full items-center rounded-xl p-2 px-4",
                  isMe ? "bg-green-100" : "hover:bg-neutral-100",
                )}
              >
                <p
                  className={cn("mr-4 w-6 text-center font-extrabold", rankColor)}
                >
                  {u.rank}
                </p>

                <div className="ml-2 mr-5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500 font-extrabold text-white">
                  <StudentAvatar avatarId={u.avatarId} />
                </div>

                <p className="flex-1 truncate font-bold text-neutral-700">
                  {u.name}
                  {u.showcaseAchievement && (
                    <span
                      className="achievement-rarity ml-2 inline-flex cursor-default rounded-full border px-1.5 py-0.5"
                      data-rarity={u.showcaseAchievement.rarity}
                      data-state="unlocked"
                      title={u.showcaseAchievement.title}
                    >
                      {u.showcaseAchievement.icon ?? "🏆"}
                    </span>
                  )}
                  {isMe && (
                    <span className="ml-2 text-xs font-bold text-green-600">
                      (ты)
                    </span>
                  )}
                </p>

                <p className="shrink-0 font-bold text-neutral-400">
                  {u.totalXp} XP
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
