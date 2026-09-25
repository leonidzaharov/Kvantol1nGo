import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { ProfileView } from "../profile-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Чужой профиль — открывается из лидерборда (и «Активности» у наставника).
// Личное (монеты, кнопка «Выйти») показывает только своя страница /profile.
export default async function UserProfilePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;

  // Свой профиль живёт на /profile — там монеты и «Выйти».
  if (id === session.user.id) {
    redirect("/profile");
  }

  const [viewer, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    }),
    prisma.user.findUnique({
      where: { id },
      select: { isAdmin: true },
    }),
  ]);

  // Профиль наставника ученикам не показываем — как и в лидерборде,
  // наставник не соревнуется и не светится. Наставник видит всех.
  if (!target || (target.isAdmin && !viewer?.isAdmin)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[700px] px-3 pb-8">
      <ProfileView userId={id} isOwn={false} />
    </div>
  );
}
