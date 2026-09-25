import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN,
  E2E_ADMIN_PIN,
  E2E_GROUP,
  E2E_PIN,
  E2E_STUDENT,
  readStudentRewards,
} from "./sandbox";

const WORK_TITLE = "E2E · JavaScript · Проект";
const FIRST_CODE = "const answer = 40;\nconsole.log(answer);";
const FIXED_CODE = "const answer = 42;\nconsole.log(answer);";
const REVISION_COMMENT = "Исправь значение answer на 42.";

test.setTimeout(120_000);

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

test("черновик → публикация → возврат → повторная отправка → принятие без наград", async ({
  browser,
}) => {
  const rewardsBefore = await readStudentRewards();
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginAdmin(adminPage);
  await adminPage.goto("/admin/review-assignments/new");
  await adminPage.getByLabel("Название").fill(WORK_TITLE);
  await adminPage
    .getByLabel("Инструкция")
    .fill("Напиши скрипт, который выводит число 42.");
  await adminPage.getByLabel("Формат ответа").selectOption("CODE");
  await adminPage.getByLabel("Язык кода").selectOption("JAVASCRIPT");
  await adminPage.getByLabel(E2E_GROUP, { exact: true }).check();
  await adminPage.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review-assignments\/\d+$/);
  await expect(adminPage.getByText("Черновик", { exact: true })).toBeVisible();

  const match = adminPage.url().match(/review-assignments\/(\d+)$/);
  expect(match).not.toBeNull();
  const assignmentId = Number(match?.[1]);

  await loginStudent(studentPage);
  await expect(
    studentPage.getByRole("link", { name: /Мои работы/ }),
  ).toHaveCount(0);
  await studentPage.goto(`/works/${assignmentId}`);
  await expect(studentPage.getByText(WORK_TITLE, { exact: true })).toHaveCount(
    0,
  );

  await adminPage.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    adminPage.getByText("Опубликовано", { exact: true }),
  ).toBeVisible();

  await studentPage.goto("/learn");
  await expect(
    studentPage.getByRole("link", { name: /Мои работы/ }),
  ).toBeVisible();
  await studentPage.goto(`/works/${assignmentId}`);
  await expect(studentPage.getByText(WORK_TITLE, { exact: true })).toBeVisible();
  await studentPage
    .getByLabel("Код для отправки наставнику")
    .fill(FIRST_CODE);
  await studentPage
    .getByRole("button", { name: "Отправить наставнику" })
    .click();
  await expect(studentPage.getByText("Ответ отправлен наставнику.")).toBeVisible(
    { timeout: 30_000 },
  );

  await adminPage.goto(`/admin/review-assignments/${assignmentId}`);
  await adminPage.getByRole("link", { name: "Проверить" }).click();
  await expect(adminPage.getByLabel("Код ученика, версия 1")).toContainText(
    "answer = 40",
  );
  await adminPage
    .getByLabel("Комментарий наставника")
    .fill(REVISION_COMMENT);
  await adminPage.getByRole("button", { name: "Вернуть" }).click();
  await expect(adminPage).toHaveURL(
    new RegExp(`/admin/review-assignments/${assignmentId}$`),
  );

  await studentPage.goto("/learn");
  await expect(
    studentPage.getByLabel("Требуют исправления: 1").first(),
  ).toBeVisible();
  await studentPage.goto(`/works/${assignmentId}`);
  await expect(studentPage.getByText(REVISION_COMMENT).first()).toBeVisible();
  await studentPage
    .getByLabel("Код для отправки наставнику")
    .fill(FIXED_CODE);
  await studentPage
    .getByRole("button", { name: "Отправить исправленную версию" })
    .click();
  await expect(studentPage.getByText("Ответ отправлен наставнику.")).toBeVisible(
    { timeout: 30_000 },
  );

  await adminPage.goto(`/admin/review-assignments/${assignmentId}`);
  await adminPage.getByRole("link", { name: "Проверить" }).click();
  await expect(adminPage.getByLabel("Код ученика, версия 2")).toContainText(
    "answer = 42",
  );
  await adminPage.getByRole("button", { name: "Принять" }).click();
  await expect(adminPage).toHaveURL(
    new RegExp(`/admin/review-assignments/${assignmentId}$`),
  );

  await studentPage.goto(`/works/${assignmentId}`);
  await expect(
    studentPage.getByText("Принято", { exact: true }).first(),
  ).toBeVisible();
  await expect(studentPage.getByText("Версия 2 · последняя")).toBeVisible();
  await expect(studentPage.getByText("Версия 1")).toBeVisible();

  expect(await readStudentRewards()).toEqual(rewardsBefore);

  await adminContext.close();
  await studentContext.close();
});
