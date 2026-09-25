// Быстрая проверка: Prisma-клиент соединяется с Supabase, видит перенесённые
// данные, базовые join'ы работают. PinHash не печатаем.
import "dotenv/config";
import { prisma } from "../src/lib/db.js";

async function main() {
  const [users, lessons, achievements, categories] = await Promise.all([
    prisma.user.count(),
    prisma.lesson.count(),
    prisma.achievement.count(),
    prisma.category.count(),
  ]);

  console.log("Счётчики строк:");
  console.log(`  User:        ${users}`);
  console.log(`  Lesson:      ${lessons}`);
  console.log(`  Achievement: ${achievements}`);
  console.log(`  Category:    ${categories}`);

  // Проверяем join: один пользователь и его прогресс.
  const firstUser = await prisma.user.findFirst({
    select: { id: true, name: true, level: true, totalXp: true, streakDays: true },
  });
  console.log("\nПервый пользователь (без pinHash):");
  console.log(firstUser);

  if (firstUser) {
    const progress = await prisma.userLessonProgress.findMany({
      where: { userId: firstUser.id },
      include: { lesson: { select: { title: true } } },
    });
    console.log(`\nПрогресс ${firstUser.name}:`);
    for (const p of progress) {
      console.log(
        `  - ${p.lesson.title}: ${p.answeredCount}/${p.totalQuestions}` +
          (p.isCompleted ? " (завершён)" : ""),
      );
    }

    const achv = await prisma.userAchievement.findMany({
      where: { userId: firstUser.id, isUnlocked: true },
      include: { achievement: { select: { title: true } } },
    });
    console.log(`\nОткрытые достижения ${firstUser.name}: ${achv.length}`);
    for (const a of achv) {
      console.log(`  - ${a.achievement.title}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
