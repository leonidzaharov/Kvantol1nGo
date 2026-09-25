import Link from "next/link";

import { Button } from "@/components/ui/button";

// Корневой not-found ловит и notFound() из сегментов, и любые несуществующие
// URL по всему приложению (напр. /lesson/9999). Рендерится внутри корневого
// layout, поэтому html/body тут не нужны.
export default function NotFound() {
  return (
    <div className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center gap-y-6 px-6 text-center">
      <div className="text-7xl">🧭</div>

      <h1 className="text-2xl font-bold text-neutral-700 lg:text-3xl">
        Такой страницы нет
      </h1>
      <p className="font-medium text-neutral-500">
        Похоже, ссылка устарела или в адресе опечатка.
      </p>

      <Button variant="secondary" size="lg" asChild>
        <Link href="/">На главную</Link>
      </Button>
    </div>
  );
}
