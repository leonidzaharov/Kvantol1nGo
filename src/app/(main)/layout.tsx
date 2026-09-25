import { AchievementEffects } from "@/components/achievement-effects";
import type { PropsWithChildren } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AchievementNotificationCenter } from "@/components/achievement-notification-center";
import { MobileHeader } from "@/components/mobile-header";
import { Sidebar } from "@/components/sidebar";
import { prisma } from "@/lib/db";

const MainLayout = async ({ children }: PropsWithChildren) => {
  const session = await auth();
  const identity = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true, profileConfiguredAt: true },
      })
    : null;
  if (session?.user?.id && !identity) redirect("/api/orphan-signout");
  if (identity && !identity.isAdmin && !identity.profileConfiguredAt) {
    redirect("/profile-setup");
  }
  const pendingRows = session?.user?.id
    ? await prisma.userAchievement.findMany({
        where: {
          userId: session.user.id,
          isUnlocked: true,
          notifiedAt: null,
          achievement: { isActive: true },
        },
        orderBy: { unlockedAt: "asc" },
        take: 30,
        select: {
          achievement: {
            select: {
              id: true,
              title: true,
              description: true,
              icon: true,
              rarity: true,
              rewardCurrency: true,
            },
          },
        },
      })
    : [];
  const pendingAchievements = pendingRows.map((row) => row.achievement);

  return (
    <>
      <AchievementEffects />
      <MobileHeader />
      <Sidebar className="hidden lg:flex" />
      <main className="h-full pt-[50px] lg:pl-[256px] lg:pt-0">
          <div className="main-content mx-auto h-full max-w-[1056px] pt-6">{children}</div>
      </main>
      <AchievementNotificationCenter
        initialAchievements={pendingAchievements}
      />
    </>
  );
};

export default MainLayout;
