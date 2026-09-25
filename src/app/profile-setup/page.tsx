import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

import { ProfileSetupForm } from "./profile-setup-form";

export default async function ProfileSetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      mentorLabel: true,
      isAdmin: true,
      profileConfiguredAt: true,
      privacyAcceptedAt: true,
    },
  });
  if (!user) redirect("/api/orphan-signout");
  if (user.isAdmin) redirect("/admin/groups");

  return (
    <main className="flex min-h-full items-center justify-center bg-green-50 px-4 py-10">
      <section className="w-full max-w-[520px] rounded-3xl border-2 border-green-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500 text-2xl font-extrabold text-white">
          К
        </div>
        <h1 className="mt-4 text-center text-2xl font-extrabold text-neutral-700">
          {user.profileConfiguredAt ? "Настройки имени" : "Давай познакомимся"}
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          Используй ник и короткую пометку без имени и фамилии. Другие ученики увидят только выбранный ник.
        </p>

        <ProfileSetupForm
          nickname={user.name}
          mentorLabel={user.mentorLabel ?? user.name}
          requiresConsent={!user.privacyAcceptedAt}
        />

        {user.profileConfiguredAt ? (
          <Button asChild variant="ghost" className="mt-3 w-full">
            <Link href="/profile">Отмена</Link>
          </Button>
        ) : null}
      </section>
    </main>
  );
}
