import { readFileSync } from "node:fs";
import path from "node:path";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Result } from "axe-core";

import {
  E2E_ADMIN,
  E2E_ADMIN_PIN,
  E2E_COURSE,
  E2E_GROUP,
  E2E_PIN,
  E2E_STUDENT,
} from "./sandbox";

const { lessonId } = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", ".fixtures.json"), "utf8"),
) as { lessonId: number };

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

function formatViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
        .join("\n");
      return `${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    // Next.js Dev Tools существует только в dev-сервере и не входит в продукт.
    .exclude("nextjs-portal")
    .analyze();
  const violations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    violations,
    `${screen}:\n${formatViolations(violations)}`,
  ).toEqual([]);
}

test("вход ученика доступен на каждом шаге выбора профиля", async ({ page }) => {
  await page.goto("/");
  await expectNoSeriousViolations(page, "Выбор направления");

  await page.getByRole("button", { name: "Вводный" }).click();
  await expectNoSeriousViolations(page, "Выбор группы");

  await page.getByRole("button", { name: E2E_GROUP }).click();
  await expectNoSeriousViolations(page, "Выбор ученика");

  await page.getByRole("button", { name: E2E_STUDENT }).click();
  await expectNoSeriousViolations(page, "Форма PIN");

  // Минимальный keyboard-smoke: до интерактивного элемента можно добраться
  // клавишей Tab, фокус не теряется в документе.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("основные экраны ученика не имеют серьёзных нарушений", async ({ page }) => {
  await loginStudent(page);
  await page.goto("/courses");
  await page.getByText(E2E_COURSE, { exact: true }).click();
  await expect(page).toHaveURL(/\/learn/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: E2E_COURSE }),
  ).toBeVisible();

  const screens = [
    ["/learn", "Главная ученика"],
    ["/courses", "Курсы"],
    ["/interesting", "Интересное"],
    ["/achievements", "Достижения"],
    ["/profile", "Профиль"],
  ] as const;

  for (const [url, name] of screens) {
    await page.goto(url);
    await expect(page.locator("main").last()).toBeVisible();
    await expectNoSeriousViolations(page, name);
  }

  await page.goto(`/lesson/${lessonId}`);
  await expect(page.getByText("Теория · шаг 1 из 2")).toBeVisible();
  await expectNoSeriousViolations(page, "Первый шаг теории урока");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByText("Теория · шаг 2 из 2")).toBeVisible();
  await expectNoSeriousViolations(page, "Второй шаг теории урока");
  await page.getByRole("button", { name: "К заданиям" }).click();
  await expect(page.getByText("Сколько будет 2 + 2?")).toBeVisible();
  await expectNoSeriousViolations(page, "Интерактивная задача урока");
});

test("основные экраны наставника не имеют серьёзных нарушений", async ({
  page,
}) => {
  await loginAdmin(page);

  const screens = [
    ["/admin/lessons", "Админка уроков"],
    ["/admin/groups", "Админка групп"],
    ["/admin/resources", "Админка интересного"],
    ["/admin/achievements", "Админка достижений"],
    ["/admin/activity", "Дашборд занятия"],
  ] as const;

  for (const [url, name] of screens) {
    await page.goto(url);
    await expect(page.locator("main").last()).toBeVisible();
    await expectNoSeriousViolations(page, name);
  }
});
