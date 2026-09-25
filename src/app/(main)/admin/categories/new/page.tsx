import { requireAdminOr404 } from "@/lib/server-guard";

import { CategoryForm } from "../category-form";

export default async function NewCategoryPage() {
  await requireAdminOr404();

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Новый курс
        </h1>
        <CategoryForm />
      </div>
    </div>
  );
}
