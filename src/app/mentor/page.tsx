import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MentorLoginForm } from "@/components/auth/MentorLoginForm";

/**
 * Скрытая страница входа наставника: ссылок на неё в интерфейсе нет,
 * адрес знают только свои. Пускает по имени + длинному PIN (8–10 цифр);
 * authorize() по имени принимает только админов, так что ученический
 * аккаунт через эту форму открыть нельзя.
 */
export default async function MentorLoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/learn");
  }

  return <MentorLoginForm />;
}
