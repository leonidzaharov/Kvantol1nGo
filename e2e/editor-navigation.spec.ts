import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_ADMIN_PIN } from "./sandbox";

test.setTimeout(90_000);

async function openEditor(page: Page) {
  await page.goto("/mentor");
  await page.locator("#mentor-name").fill(E2E_ADMIN);
  await page.locator("#mentor-pin").fill(E2E_ADMIN_PIN);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
  await page.goto("/admin/lessons/new");
  await expect(page.getByRole("radio", { name: "Source mode", exact: true })).toBeVisible();
}

test("переключение MD и визуального режима сохраняет место в длинном уроке", async ({ page }) => {
  await openEditor(page);
  const text = Array.from({ length: 100 }, (_, n) => `Фрагмент ${n + 1}. ${"Подробное объяснение шага. ".repeat(10)}Конец ${n + 1}.`).join("\n\n");
  await page.locator('input[accept=".md,.markdown,text/markdown"]').setInputFiles({
    name: "long-theory.md", mimeType: "text/markdown", buffer: Buffer.from(text),
  });
  const marker = page.getByRole("textbox", { name: "editable markdown", exact: true }).getByText(/^Фрагмент 80\./);
  await marker.scrollIntoViewIfNeeded();
  await expect(page.getByRole("radio", { name: "Source mode", exact: true })).toBeInViewport();
  await page.getByRole("radio", { name: "Source mode", exact: true }).click();
  await expect(page.locator(".mdxeditor-source-editor .cm-line").filter({ hasText: /^Фрагмент 80\./ })).toBeInViewport();
  const source = page.locator(".mdxeditor-source-editor .cm-content");
  await source.press("Control+End");
  await source.press("z");
  await page.getByRole("radio", { name: "Rich text", exact: true }).click();
  await expect(marker).toBeInViewport();
  await page.getByRole("radio", { name: "Source mode", exact: true }).click();
  await expect(page.locator(".mdxeditor-source-editor .cm-line").filter({ hasText: /^Фрагмент 100\./ })).toBeInViewport();
});

test("неудачную загрузку картинки можно повторить в MD без повторного импорта урока", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("radio", { name: "Source mode", exact: true }).click();
  await page.locator(".mdxeditor-source-editor .cm-content").fill("# Схема\n\n![Схема цикла](images/cycle.png)\n\nТекст после картинки.");
  const images = page.getByRole("region", { name: "Картинки урока", exact: true });
  await expect(images).toBeVisible();
  await expect(images.getByText("images/cycle.png", { exact: true })).toBeVisible();
  let uploads = 0;
  await page.route("**/api/admin/upload-image", async (route) => {
    uploads++;
    await route.fulfill({ status: uploads === 1 ? 503 : 200, contentType: "application/json",
      body: JSON.stringify(uploads === 1 ? { error: "Хранилище временно недоступно" } : { url: "/media/repaired.png" }) });
  });
  await images.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "cycle.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgXQAAAAASUVORK5CYII=", "base64"),
  });
  await expect(images.getByText("Хранилище временно недоступно", { exact: true })).toBeVisible();
  await expect(page.locator(".mdxeditor-source-editor .cm-content")).toContainText("images/cycle.png");
  await images.getByRole("button", { name: "Повторить загрузку", exact: true }).click();
  await expect(page.locator(".mdxeditor-source-editor .cm-content")).toContainText("/media/repaired.png");
  await expect(page.locator(".mdxeditor-source-editor .cm-content")).toContainText("Текст после картинки.");
  expect(uploads).toBe(2);
});
