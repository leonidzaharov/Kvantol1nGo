import type { PropsWithChildren } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { NoCopyZone } from "./no-copy-zone";

// Экран урока — полноэкранный (без сайдбара (main)-группы): шапка сверху,
// контент по центру, footer проверки снизу. NoCopyZone глушит копирование
// и контекстное меню на всём экране урока (защита от списывания).
const LessonLayout = async ({ children }: PropsWithChildren) => {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const identity = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, profileConfiguredAt: true },
  });
  if (!identity) redirect("/api/orphan-signout");
  if (!identity.isAdmin && !identity.profileConfiguredAt) {
    redirect("/profile-setup");
  }

  return (
    <div className="flex h-full flex-col">
      <NoCopyZone>{children}</NoCopyZone>
    </div>
  );
};

export default LessonLayout;
