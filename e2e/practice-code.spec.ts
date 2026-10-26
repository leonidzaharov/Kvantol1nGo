import { expect, test, type Page } from "@playwright/test";
import { createPracticeFixture, PRACTICE_CODE, readPracticeState, type PracticeFixture } from "./practice-fixture";
import { E2E_GROUP, E2E_PIN } from "./sandbox";

test.setTimeout(180_000);

async function login(page: Page, fixture: PracticeFixture) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Вводный \d+ гр\.$/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: new RegExp(`^${E2E_GROUP} \\d+ уч\\.$`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${fixture.studentName} Ур\\. \\d+$`) }).click();
  await page.locator("#profile-pin").fill(E2E_PIN);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
  await page.goto(`/lesson/${fixture.lessonId}`);
  await expect(page.getByRole("heading", { name: PRACTICE_CODE.firstPrompt, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function expectFeedback(page: Page, correct: boolean) {
  await expect(page.getByRole("region", { name: "Разбор ответа" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: correct ? "Верно!" : "Пока не получилось", exact: true })).toBeVisible();
}

async function next(page: Page) {
  await page.getByRole("region", { name: "Разбор ответа" }).getByRole("button", { name: "Далее", exact: true }).click();
}

async function answerOtherQuestions(page: Page) {
  await expect(page.getByRole("heading", { name: "Сколько чисел даёт range(1, 4)?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expectFeedback(page, true);
  await next(page);
  await expect(page.getByRole("heading", { name: "При каком energy станет ложным условие energy < 3?", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Твой ответ", exact: true }).fill("3");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expectFeedback(page, true);
  await next(page);
}

test("Python: ошибка, разбор, два других вопроса, новый пример и однократная награда", async ({ page }) => {
  const fixture = await createPracticeFixture();
  await login(page, fixture);

  const initialHtml = await page.content();
  for (const field of ["referenceSolution", "expectedOutput", "correctAnswer", "correctIndex", "explanation"]) {
    expect(initialHtml, `${field} must not be disclosed before an attempt`).not.toContain(field);
  }
  const editor = page.getByRole("textbox", { name: "Код на Python", exact: true });
  await expect(editor).toHaveValue(PRACTICE_CODE.wrong);
  // Real Pyodide executes this program. Runtime and grading are not mocked.
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, false);
  await expect(page.getByText(/TypeError: can only concatenate str/)).toBeVisible();
  await expect(page.locator('pre[aria-label="Правильный код"]')).toHaveText(PRACTICE_CODE.firstSolution);
  await expect(page.getByText(PRACTICE_CODE.explanation, { exact: true })).toBeVisible();
  expect((await readPracticeState(fixture)).progress?.answeredCore).toEqual([]);

  await next(page);
  await answerOtherQuestions(page);
  await expect(page.getByText("Другой пример на тот же навык", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: PRACTICE_CODE.secondPrompt, exact: true })).toBeVisible();
  expect((await readPracticeState(fixture)).progress?.answeredCore).toEqual([1, 2]);
  await editor.fill(PRACTICE_CODE.secondSolution);
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, true);
  await next(page);
  await expect(page.getByRole("heading", { name: "Практика завершена!", exact: true })).toBeVisible();

  // Reload restores exact solutions and does not require solving the route again.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Практика завершена!", exact: true })).toBeVisible();
  expect((await readPracticeState(fixture)).progress).toMatchObject({ answeredCore: [0, 1, 2], isCompleted: false, wrongAttempts: 1 });

  // A lost finish request must allow retry without another exercise or duplicate payout.
  let failFinish = true;
  await page.route(`**/lesson/${fixture.lessonId}`, async (route) => {
    if (failFinish && route.request().method() === "POST") { failFinish = false; await route.abort(); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Завершить урок", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось подтвердить завершение" })).toBeVisible();
  expect((await readPracticeState(fixture)).progress?.isCompleted).toBe(false);
  await page.getByRole("button", { name: "Завершить урок", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Урок пройден!", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-coins")).toContainText("20");
  const firstCurrency = (await readPracticeState(fixture)).currency;

  await page.getByRole("button", { name: "Задания со звёздочкой", exact: true }).click();
  await page.getByRole("textbox", { name: "Твой ответ", exact: true }).fill("2");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expectFeedback(page, true);
  await next(page);
  expect((await readPracticeState(fixture)).currency).toBe(firstCurrency);

  // Completed replay starts fresh but the existing completion pays no coins again.
  await page.reload();
  await expect(page.getByRole("heading", { name: PRACTICE_CODE.firstPrompt, exact: true })).toBeVisible();
  await editor.fill(PRACTICE_CODE.firstSolution);
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, true);
  await next(page);
  await answerOtherQuestions(page);
  await page.getByRole("button", { name: "Завершить урок", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Повторение завершено!", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-coins")).toContainText("0");
  expect((await readPracticeState(fixture)).currency).toBe(firstCurrency);
});

test("сбой проверки Python сохраняет ввод и не превращается в учебную ошибку", async ({ page }) => {
  const fixture = await createPracticeFixture();
  await login(page, fixture);
  const editor = page.getByRole("textbox", { name: "Код на Python", exact: true });
  await editor.fill(PRACTICE_CODE.firstSolution);
  let failCheck = true;
  await page.route(`**/lesson/${fixture.lessonId}`, async (route) => {
    if (failCheck && route.request().method() === "POST") { failCheck = false; await route.abort(); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Твой ответ сохранён на экране" })).toBeVisible({ timeout: 45_000 });
  await expect(editor).toHaveValue(PRACTICE_CODE.firstSolution);
  await expect(page.getByRole("region", { name: "Разбор ответа" })).toHaveCount(0);
  expect((await readPracticeState(fixture)).progress).toMatchObject({ answeredCore: [], wrongAttempts: 0 });
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, true);
  expect((await readPracticeState(fixture)).progress?.answeredCore).toEqual([0]);
});

test("бесконечный Python-цикл останавливается, следующий запуск работает", async ({ page }) => {
  const fixture = await createPracticeFixture();
  await login(page, fixture);
  const editor = page.getByRole("textbox", { name: "Код на Python", exact: true });
  await editor.fill("while True:\n    pass");
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, false);
  await expect(page.getByText(/Программа выполнялась слишком долго/)).toBeVisible();
  expect((await readPracticeState(fixture)).progress).toMatchObject({ answeredCore: [], wrongAttempts: 1 });
  await page.reload();
  await editor.fill(PRACTICE_CODE.firstSolution);
  await page.getByRole("button", { name: "Запустить и проверить", exact: true }).click();
  await expectFeedback(page, true);
  expect((await readPracticeState(fixture)).progress?.answeredCore).toEqual([0]);
});
