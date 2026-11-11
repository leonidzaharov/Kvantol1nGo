import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPracticeFixture, PRACTICE_CODE, readPracticeState, type PracticeFixture } from "./practice-fixture";
import { E2E_GROUP, E2E_PIN, E2E_STUDENT, resetLessonProgress } from "./sandbox";

test.setTimeout(120_000);
const theory = "## Первая схема\n\nНачальный пример.\n\n```python\nprint(1)\n```\n\n## Вторая схема\n\nСледующий шаг.\n\n## Третья схема\n\nПоследний шаг.";

async function login(page: Page, fixture: Pick<PracticeFixture, "lessonId" | "studentName">) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Вводный \d+ гр\.$/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${E2E_GROUP} \\d+ уч\\.$`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${fixture.studentName} Ур\\. \\d+$`) }).click();
  await page.locator("#profile-pin").fill(E2E_PIN);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
  await page.goto(`/lesson/${fixture.lessonId}`);
}

async function start(page: Page) {
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "К практике", exact: true }).click();
  await expect(page.getByRole("heading", { name: PRACTICE_CODE.firstPrompt, exact: true })).toBeVisible();
}

async function review(page: Page) {
  await page.getByRole("button", { name: "К теории", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const material = page.getByRole("region", { name: "Материал урока", exact: true });
  await expect(material.getByRole("heading", { name: "Первая схема", exact: true })).toBeVisible();
  await expect(material.getByText("print(1)", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Учебная практика", exact: true })).toBeHidden();
  await expect(material.getByRole("button", { name: "Назад", exact: true })).toBeDisabled();
  await material.getByRole("button", { name: "Далее", exact: true }).click();
  await material.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(material.getByRole("heading", { name: "Первая схема", exact: true })).toBeVisible();
  await material.getByRole("button", { name: "Далее", exact: true }).click();
  await material.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(material.getByRole("heading", { name: "Третья схема", exact: true })).toBeVisible();
  await material.getByRole("button", { name: "Продолжить практику", exact: true }).click();
  await expect(material).toHaveCount(0);
}

test("теория листается назад без отката достигнутого прогресса", async ({ page }) => {
  const fixture = await createPracticeFixture({ theory });
  await login(page, fixture);
  await expect(page.getByRole("button", { name: "Назад", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Вторая схема", exact: true })).toBeVisible();
  await expect.poll(async () => (await readPracticeState(fixture)).progress?.theoryStep).toBe(1);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Первая схема", exact: true })).toBeVisible();
  expect((await readPracticeState(fixture)).progress?.theoryStep).toBe(1);
  await start(page);
  await expect(page.getByRole("heading", { name: PRACTICE_CODE.firstPrompt, exact: true })).toBeVisible();
  expect((await readPracticeState(fixture)).progress?.theoryStep).toBe(3);
});

test("возврат к первой странице сохраняет код выбор текст пары и разбор", async ({ page }) => {
  const fixture = await createPracticeFixture({ theory, matching: true });
  await login(page, fixture);
  await start(page);
  const before = await readPracticeState(fixture);
  const editor = page.getByRole("textbox", { name: "Код на Python", exact: true });
  await editor.fill(PRACTICE_CODE.firstSolution);
  await review(page);
  await expect(editor).toHaveValue(PRACTICE_CODE.firstSolution);
  expect(await readPracticeState(fixture)).toEqual(before);
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Верно!", exact: true })).toBeVisible({ timeout: 45_000 });
  await review(page);
  await expect(page.getByRole("heading", { name: "Верно!", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await review(page);
  await expect(page.getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("textbox", { name: "Твой ответ", exact: true }).fill("3");
  await review(page);
  await expect(page.getByRole("textbox", { name: "Твой ответ", exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "range(2)", exact: true }).click();
  await page.getByRole("button", { name: "0, 1", exact: true }).click();
  await review(page);
  await expect(page.getByText("Соединено: 1 из 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "range(1, 3)", exact: true }).click();
  await page.getByRole("button", { name: "1, 2", exact: true }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Завершить урок", exact: true }).click();
  await expect(page.getByTestId("result-coins")).toContainText("20");
  await page.getByRole("button", { name: "Задания со звёздочкой", exact: true }).click();
  await page.getByRole("textbox", { name: "Твой ответ", exact: true }).fill("2");
  await review(page);
  await expect(page.getByRole("heading", { name: "Сколько повторов у range(2)?", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Твой ответ", exact: true })).toHaveValue("2");
});

test("на телефоне возврат из материала сохраняет фокус и черновик", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await createPracticeFixture({ theory });
  await login(page, fixture);
  await start(page);
  const editor = page.getByRole("textbox", { name: "Код на Python", exact: true });
  await editor.fill("print('Черновик')");
  const opener = page.getByRole("button", { name: "К теории", exact: true });
  await opener.click();
  const material = page.getByRole("region", { name: "Материал урока", exact: true });
  await expect(material.getByRole("button", { name: "Вернуться к практике", exact: true })).toBeInViewport();
  expect(await material.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await expect(editor).toBeHidden();
  await material.getByRole("button", { name: "Вернуться к практике", exact: true }).click();
  await expect(material).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(editor).toHaveValue("print('Черновик')");
});

test("обычный урок тоже позволяет читать теорию из вопроса без новой попытки", async ({ page }) => {
  const { lessonId } = JSON.parse(readFileSync(path.join(process.cwd(), "e2e", ".fixtures.json"), "utf8")) as { lessonId: number };
  await resetLessonProgress(lessonId);
  await login(page, { lessonId, studentName: E2E_STUDENT });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("button", { name: "К заданиям", exact: true }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "К теории", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const material = page.getByRole("region", { name: "Материал урока", exact: true });
  await expect(material.getByRole("heading", { name: "Первый шаг", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "4", exact: true })).toBeHidden();
  // Enter advances only the material; the hidden question must not be submitted.
  await material.press("Enter");
  await expect(page.getByRole("heading", { name: "Второй шаг", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(material.getByRole("heading", { name: "Первый шаг", exact: true })).toBeVisible();
  await material.getByRole("button", { name: "Вернуться к практике", exact: true }).click();
  await expect(page.getByRole("button", { name: "4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Отлично!", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Проверить", exact: true })).toBeEnabled();
});
