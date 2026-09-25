import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN,
  E2E_ADMIN_PIN,
  E2E_COPY_COURSE,
  E2E_COPY_LESSON,
  E2E_LESSON_TITLE,
} from "./sandbox";

const { copyCourseId } = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", ".fixtures.json"), "utf8"),
) as { copyCourseId: number };

async function loginAdmin(page: Page) {
  await page.goto("/mentor");
  await page.locator("#mentor-name").fill(E2E_ADMIN);
  await page.locator("#mentor-pin").fill(E2E_ADMIN_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

test("наставник выбирает курс, редактирует его уроки и удаляет курс целиком", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/lessons");

  await page
    .locator('select[name="courseId"]')
    .selectOption(String(copyCourseId));
  await page.getByRole("button", { name: "Показать уроки" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/lessons\\?courseId=${copyCourseId}`),
  );
  await expect(page.getByText(E2E_COPY_LESSON, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_LESSON_TITLE, { exact: true })).toHaveCount(0);

  await page.goto("/admin/categories");
  const courseRow = page.locator("li").filter({ hasText: E2E_COPY_COURSE });
  await expect(courseRow.getByRole("button", { name: "Удалить" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await courseRow.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(E2E_COPY_COURSE, { exact: true })).toHaveCount(0);
});
