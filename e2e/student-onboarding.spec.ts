import { expect, test } from "@playwright/test";

import { E2E_ADMIN, E2E_ADMIN_PIN, E2E_GROUP } from "./sandbox";

const NEW_STUDENT = "Новый ученик E2E";
const NEW_PIN = "5678";

test("наставник видит учеников в таблице, а новый ученик подтверждает политику", async ({ browser, page }) => {
  await page.goto("/mentor");
  await page.locator("#mentor-name").fill(E2E_ADMIN);
  await page.locator("#mentor-pin").fill(E2E_ADMIN_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });

  await page.goto("/admin/groups");
  await expect(page.getByRole("link", { name: "Создать ученика" })).toBeVisible();
  await page.getByRole("link", { name: "Создать ученика" }).click();
  await expect(page.getByRole("link", { name: "Создать ученика" })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Пометка без ФИО").fill(NEW_STUDENT);
  await page.getByLabel("Временный ник").fill(NEW_STUDENT);
  await page.getByLabel("PIN").fill(NEW_PIN);
  await page.getByRole("combobox", { name: "Группа", exact: true }).selectOption({ label: E2E_GROUP });
  await page.getByRole("button", { name: "Создать ученика" }).click();
  await expect(page.getByText("Ученик создан.", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Открыть таблицу учеников" }).click();
  await expect(page.getByRole("columnheader", { name: "Ник", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(NEW_STUDENT) })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/");
  await studentPage.getByRole("button", { name: "Вводный" }).click();
  await studentPage.getByRole("button", { name: E2E_GROUP }).click();
  await studentPage.getByRole("button", { name: NEW_STUDENT }).click();
  await studentPage.locator("#profile-pin").fill(NEW_PIN);
  await studentPage.getByRole("button", { name: "Войти" }).click();
  await expect(studentPage).toHaveURL(/\/profile-setup/, { timeout: 30_000 });
  await expect(studentPage.getByRole("link", { name: "политикой конфиденциальности" })).toHaveAttribute("href", "/privacy");

  // HTML validation is useful, but the server must reject a forged unchecked form too.
  await studentPage.locator('input[name="privacyAccepted"]').evaluate((input) => input.removeAttribute("required"));
  await studentPage.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(studentPage.getByRole("alert").filter({ hasText: "политикой конфиденциальности" })).toBeVisible();
  await studentPage.locator('input[name="privacyAccepted"]').check();
  await studentPage.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(studentPage).toHaveURL(/\/profile$/, { timeout: 30_000 });
  await studentContext.close();
});
