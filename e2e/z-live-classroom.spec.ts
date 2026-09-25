import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN,
  E2E_ADMIN_PIN,
  E2E_GROUP,
  E2E_HIDDEN_RESOURCE,
  E2E_PIN,
  E2E_STUDENT,
  E2E_VISIBLE_RESOURCE,
  resetClassroomSessions,
} from "./sandbox";

const { lessonId } = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "e2e", ".fixtures.json"),
    "utf8",
  ),
) as { lessonId: number };

async function loginAdmin(page: Page) {
  await page.goto("/mentor");
  await page.locator("#mentor-name").fill(E2E_ADMIN);
  await page.locator("#mentor-pin").fill(E2E_ADMIN_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

async function loginStudent(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Вводный" }).click();
  await page.getByRole("button", { name: E2E_GROUP }).click();
  await page.getByRole("button", { name: E2E_STUDENT }).click();
  await page.locator("#profile-pin").fill(E2E_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

test("дашборд подхватывает ученика и ошибки, сделанные до запуска занятия", async ({
  browser,
}) => {
  await resetClassroomSessions();

  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginStudent(studentPage);
  await studentPage.goto("/interesting");
  await expect(
    studentPage.getByText(E2E_VISIBLE_RESOURCE, { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText(E2E_HIDDEN_RESOURCE, { exact: true }),
  ).toHaveCount(0);

  await studentPage.goto(`/lesson/${lessonId}`);
  await studentPage.getByRole("button", { name: "Продолжить" }).click();
  await studentPage.getByRole("button", { name: "К заданиям" }).click();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await studentPage.getByRole("button", { name: "3", exact: true }).click();
    await studentPage.getByRole("button", { name: "Проверить" }).click();
    const retryButton = studentPage.getByRole("button", {
      name: /Снова через \d сек\.|Попробовать снова/,
    });
    await expect(retryButton).toBeDisabled();
    await expect(retryButton).toBeEnabled({ timeout: 7_000 });
    await retryButton.click();
  }

  await loginAdmin(adminPage);
  await adminPage.goto("/admin/activity");
  await expect(adminPage.getByText("Активного занятия пока нет.")).toBeVisible();
  await adminPage.getByLabel("Группа").selectOption({ label: E2E_GROUP });
  await adminPage.getByLabel("Урок").selectOption(String(lessonId));
  await adminPage.getByRole("button", { name: "Начать занятие" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/activity\?sessionId=\d+/);
  await expect(adminPage.getByText("● В эфире")).toBeVisible();

  const studentRow = adminPage
    .locator("tbody tr")
    .filter({ hasText: E2E_STUDENT });
  await expect(studentRow).toContainText("Нужна помощь", {
    timeout: 15_000,
  });
  await expect(studentRow).toContainText("3");

  await studentPage.getByRole("button", { name: "4", exact: true }).click();
  await studentPage.getByRole("button", { name: "Проверить" }).click();
  await studentPage.getByRole("button", { name: "Далее" }).click();
  await expect(studentPage.getByText("Урок пройден.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(studentRow).toContainText("Основная часть готова", {
    timeout: 15_000,
  });

  await studentPage
    .getByRole("button", { name: "Перейти к заданиям со звёздочкой" })
    .click();
  await studentPage.getByRole("button", { name: "42", exact: true }).click();
  await studentPage.getByRole("button", { name: "Проверить" }).click();
  await studentPage.getByRole("button", { name: "Далее" }).click();
  await expect(
    studentPage.getByText("Все задания со звёздочкой решены!"),
  ).toBeVisible();
  await expect(studentRow).toContainText("Всё готово", {
    timeout: 15_000,
  });

  await adminContext.close();
  await studentContext.close();
});
