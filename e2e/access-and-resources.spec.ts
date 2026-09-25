import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN,
  E2E_ADMIN_PIN,
  E2E_GROUP,
  E2E_PIN,
  E2E_STUDENT,
} from "./sandbox";

const RESOURCE_TITLE = "E2E · Материал для группы";
const UPDATED_RESOURCE_TITLE = "E2E · Материал для группы · изменён";

async function loginStudent(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Вводный" }).click();
  await page.getByRole("button", { name: E2E_GROUP }).click();
  await page.getByRole("button", { name: E2E_STUDENT }).click();
  await page.locator("#profile-pin").fill(E2E_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

async function loginAdmin(page: Page) {
  await page.goto("/mentor");
  await page.locator("#mentor-name").fill(E2E_ADMIN);
  await page.locator("#mentor-pin").fill(E2E_ADMIN_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

test("гостя перенаправляет на вход с административной страницы", async ({
  page,
}) => {
  await page.goto("/admin/categories");

  await expect(page).toHaveURL(/\/\?callbackUrl=/);
  await expect(page.getByText("Выбери своё направление")).toBeVisible();
});

test("ученик не видит админку: страницы скрыты за 404, API закрыт", async ({
  page,
}) => {
  await loginStudent(page);
  await expect(page.getByRole("link", { name: "Админка" })).toHaveCount(0);

  const adminPages = [
    "/admin/groups",
    "/admin/categories",
    "/admin/lessons",
    "/admin/resources",
    "/admin/achievements",
    "/admin/activity",
    "/admin/review-assignments",
  ];

  for (const path of adminPages) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Такой страницы нет" }),
      `${path} должен быть скрыт от ученика`,
    ).toBeVisible();
    await expect(page.getByText(/Админка ·/)).toHaveCount(0);
  }

  const apiResponse = await page.request.get(
    "/api/admin/class-sessions/999999",
  );
  expect(apiResponse.status()).toBe(404);
});

test("наставник управляет групповым материалом, а ученик сразу видит изменения", async ({
  browser,
  page: adminPage,
}, testInfo) => {
  await loginAdmin(adminPage);

  await adminPage.goto("/admin/resources/new");
  await adminPage.getByLabel("Тип").selectOption("note");
  await adminPage.getByLabel(E2E_GROUP).check();
  await adminPage.getByLabel("Заголовок").fill(RESOURCE_TITLE);
  await adminPage
    .getByLabel("Текст совета")
    .fill("Материал видит только назначенная группа.");
  await adminPage.getByLabel("Монеты за «Изучил»").fill("2");
  await adminPage.getByRole("button", { name: "Сохранить" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/resources$/);

  let resourceRow = adminPage.locator("li").filter({ hasText: RESOURCE_TITLE });
  await expect(resourceRow.getByText("Черновик · 1 групп")).toBeVisible();
  await resourceRow.getByRole("button", { name: "Опубликовать" }).click();
  await expect(resourceRow.getByText("Опубликован · 1 групп")).toBeVisible();

  const studentContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    locale: "ru-RU",
  });
  const studentPage = await studentContext.newPage();

  try {
    await loginStudent(studentPage);
    await studentPage.goto("/interesting");
    await expect(
      studentPage.getByRole("heading", { name: RESOURCE_TITLE }),
    ).toBeVisible();

    await resourceRow.getByRole("link", { name: "Изменить" }).click();
    await adminPage.getByLabel("Заголовок").fill(UPDATED_RESOURCE_TITLE);
    await adminPage
      .getByLabel("Текст совета")
      .fill("Обновлённый текст материала для группы.");
    await adminPage.getByRole("button", { name: "Сохранить" }).click();
    await expect(adminPage).toHaveURL(/\/admin\/resources$/);

    await studentPage.reload();
    await expect(
      studentPage.getByRole("heading", { name: UPDATED_RESOURCE_TITLE }),
    ).toBeVisible();
    await expect(
      studentPage.getByRole("heading", { name: RESOURCE_TITLE, exact: true }),
    ).toHaveCount(0);

    resourceRow = adminPage
      .locator("li")
      .filter({ hasText: UPDATED_RESOURCE_TITLE });
    adminPage.once("dialog", (dialog) => dialog.accept());
    await resourceRow.getByRole("button", { name: "Удалить" }).click();
    await expect(
      adminPage.getByText(UPDATED_RESOURCE_TITLE, { exact: true }),
    ).toHaveCount(0);

    await studentPage.reload();
    await expect(
      studentPage.getByRole("heading", { name: UPDATED_RESOURCE_TITLE }),
    ).toHaveCount(0);
  } finally {
    await studentContext.close();
  }
});
