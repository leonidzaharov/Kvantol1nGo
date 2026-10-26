import type { PracticeItem } from "./practice-types";

// Guard the client component contract. This is not a stored-content parser.
export function practiceItemsValid(items: readonly PracticeItem[]): boolean {
  const uniqueIds = (values: readonly { id: string }[]) =>
    values.every(({ id }) => id.trim().length > 0 && id.length <= 48) &&
    new Set(values.map(({ id }) => id)).size === values.length;
  return items.length > 0 && items.length <= 50 && uniqueIds(items) && items.every((item) =>
    (item.intro?.length ?? 0) <= 800 &&
    item.variants.length >= 2 && item.variants.length <= 3 && uniqueIds(item.variants) &&
    item.variants.every((variant) => {
      if (!variant.prompt.trim() || variant.prompt.length > 3000) return false;
      if (variant.type === "text") return true;
      if (variant.type === "code") return ["python", "javascript"].includes(variant.language) && variant.starterCode.length <= 10000;
      if (variant.type === "choice") return variant.options.length >= 2 && variant.options.length <= 8 &&
        variant.options.every((option) => option.trim().length > 0 && option.length <= 300);
      return variant.left.length >= 2 && variant.left.length <= 8 &&
        variant.left.length === variant.right.length &&
        uniqueIds(variant.left) && uniqueIds(variant.right) &&
        [...variant.left, ...variant.right].every(({ label }) => label.trim().length > 0 && label.length <= 160);
    }),
  );
}
