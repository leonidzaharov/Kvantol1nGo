import { LogOut, Pencil } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";

import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  // Сессия есть, а юзера в БД нет (удалён наставником) — разлогиниваем,
  // иначе notFound из ProfileView запер бы «призрака» на 404.
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true },
  });
  if (!exists) {
    redirect("/api/orphan-signout");
  }

  return (
    <div className="mx-auto max-w-[700px] px-3">
      <ProfileView userId={userId} isOwn />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {!exists.isAdmin ? (
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/profile-setup">
              <Pencil className="mr-2 h-5 w-5" />
              Изменить ник
            </Link>
          </Button>
        ) : null}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button
            type="submit"
            variant="default"
            className="w-full text-rose-500 sm:w-auto"
          >
            <LogOut className="mr-2 h-5 w-5" />
            Выйти
          </Button>
        </form>
      </div>
    </div>
  );
}
