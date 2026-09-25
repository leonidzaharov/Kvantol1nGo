import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { E2E_GROUP, E2E_PIN, E2E_STUDENT } from "./sandbox";

const { lessonId } = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", ".fixtures.json"), "utf8"),
) as { lessonId: number };

/** Вход ученика: направление → группа → профиль → PIN. */
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Вводный" }).click();
  await page.getByRole("button", { name: E2E_GROUP }).click();
  await page.getByRole("button", { name: E2E_STUDENT }).click();
  await page.locator("#profile-pin").fill(E2E_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
}

/** Проходит урок целиком: теория → верный ответ → экран результата. */
async function completeLesson(page: Page) {
  await page.goto(`/lesson/${lessonId}`);

  await expect(page.getByText("Тестовая теория")).toBeVisible();
  await expect(page.getByText("Теория · шаг 1 из 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Назад" })).toBeDisabled();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByText("Второй шаг")).toBeVisible();

  // Шаг теории сохраняется в пределах вкладки и переживает обновление.
  await page.reload();
  await expect(page.getByText("Теория · шаг 2 из 2")).toBeVisible();
  await page.getByRole("button", { name: "К заданиям" }).click();

  await expect(page.getByText("Сколько будет 2 + 2?")).toBeVisible();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Проверить" }).click();

  await expect(page.getByText("Отлично!")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByText("Урок пройден.")).toBeVisible({ timeout: 30_000 });
}

test("ученик входит, проходит урок и получает XP, монеты и ачивку", async ({
  page,
}) => {
  // Ошибки в консоли браузера — это и есть тот класс поломок, ради которого
  // затевался E2E (CSP-блокировки, упавшая гидратация). Собираем их и в конце
  // проверяем, что консоль чистая.
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await login(page);

  // Антисписывание: ответы не должны попадать в браузер вообще — ни в DOM,
  // ни в RSC-payload. Ученик с F12 не найдёт ни correctIndex, ни эталона.
  await page.goto(`/lesson/${lessonId}`);
  const html = await page.content();
  expect(html, "correctIndex утёк в браузер").not.toContain("correctIndex");
  expect(html, "referenceSolution утёк в браузер").not.toContain(
    "referenceSolution",
  );

  await completeLesson(page);

  // Награды за первое прохождение: 20 XP и 5 монет (из фикстуры урока).
  await expect(page.getByTestId("result-points")).toContainText("20");
  await expect(page.getByTestId("result-coins")).toContainText("5");

  // Ачивка «Первый урок» (цель — 1 урок) открылась и показала тост с редкостью.
  await expect(page.getByText(/Новое достижение · Обычное/)).toBeVisible();
  await expect(page.getByText("Первый урок", { exact: true })).toBeVisible();

  expect(consoleErrors, "консоль браузера должна быть чистой").toEqual([]);
});

test("повторное прохождение урока не начисляет XP заново", async ({ page }) => {
  await login(page);

  // Урок уже пройден предыдущим тестом (та же песочница, workers: 1).
  // Повтор — это «тренировка»: награды нулевые, ачивка не перевыдаётся.
  await page.goto(`/lesson/${lessonId}`);
  await expect(page.getByText("Тренировка")).toBeVisible();

  await completeLesson(page);

  await expect(page.getByTestId("result-points")).toContainText("0");
  await expect(page.getByTestId("result-coins")).toContainText("0");
  await expect(page.getByText("ДОСТИЖЕНИЕ ОТКРЫТО")).toHaveCount(0);
});

test("открытую ачивку видно в профиле и можно выставить на витрину", async ({
  page,
}) => {
  await login(page);

  await page.goto("/achievements");
  await expect(page.getByText("Первый урок", { exact: true })).toBeVisible();
  await expect(page.getByText("Выполнено")).toBeVisible();

  // Витрина: ачивка попадает в профиль и в лидерборд.
  await page.getByRole("button", { name: "Показать в профиле" }).click();
  await expect(page.getByRole("button", { name: "В профиле" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText("Открытые ачивки")).toBeVisible();
  await expect(page.getByText("Первый урок", { exact: true })).toBeVisible();
});
