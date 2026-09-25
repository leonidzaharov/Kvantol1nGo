"use client";

import type { AchievementRarity } from "@/generated/prisma";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ACHIEVEMENT_RARITY_LABELS } from "@/lib/achievement-rarity";
import { awardManualAchievement } from "@/lib/actions/achievements";

type ManualAchievementOption = {
  id: number;
  title: string;
  icon: string | null;
  rarity: AchievementRarity;
  rewardCurrency: number;
};

type StudentOption = {
  id: string;
  name: string;
  groupName: string | null;
  unlockedAchievementIds: number[];
};

export function ManualAwardPanel({
  achievements,
  students,
}: {
  achievements: ManualAchievementOption[];
  students: StudentOption[];
}) {
  const [studentId, setStudentId] = useState("");
  const [achievementId, setAchievementId] = useState("");

  const selectedStudent = students.find((student) => student.id === studentId);
  const selectedAchievement = achievements.find(
    (achievement) => achievement.id === Number(achievementId),
  );
  const alreadyAwarded =
    selectedStudent?.unlockedAchievementIds.includes(
      selectedAchievement?.id ?? -1,
    ) ?? false;
  const canSubmit = Boolean(
    selectedStudent && selectedAchievement && !alreadyAwarded,
  );

  return (
    <section className="mt-8 rounded-2xl border-2 border-violet-200 bg-violet-50 p-5">
      <h2 className="text-lg font-extrabold text-violet-800">
        Ручная выдача достижения
      </h2>
      <p className="mt-1 text-sm text-violet-700">
        Выбери ученика и подтверждённое достижение. Монеты начислятся только
        один раз.
      </p>

      <form action={awardManualAchievement} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-bold text-neutral-700">Ученик</span>
            <select
              name="userId"
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="h-11 rounded-xl border-2 border-violet-200 bg-white px-3 font-medium text-neutral-700 outline-none focus:border-violet-400"
            >
              <option value="" disabled>
                Выбери ученика
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                  {student.groupName ? ` · ${student.groupName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-bold text-neutral-700">
              Достижение
            </span>
            <select
              name="achievementId"
              required
              value={achievementId}
              onChange={(event) => setAchievementId(event.target.value)}
              className="h-11 rounded-xl border-2 border-violet-200 bg-white px-3 font-medium text-neutral-700 outline-none focus:border-violet-400"
            >
              <option value="" disabled>
                Выбери достижение
              </option>
              {achievements.map((achievement) => (
                <option key={achievement.id} value={achievement.id}>
                  {achievement.icon ?? "🏆"} {achievement.title} ·{" "}
                  {ACHIEVEMENT_RARITY_LABELS[achievement.rarity]} · +
                  {achievement.rewardCurrency}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedAchievement && (
          <div
            className="achievement-rarity flex flex-wrap items-center gap-2 rounded-xl border-2 px-4 py-3"
            data-rarity={selectedAchievement.rarity}
            data-state="unlocked"
          >
            <span className="text-2xl">{selectedAchievement.icon ?? "🏆"}</span>
            <span className="font-extrabold text-neutral-800">
              {selectedAchievement.title}
            </span>
            <span className="achievement-rarity-label rounded-md px-2 py-0.5 text-xs font-bold">
              {ACHIEVEMENT_RARITY_LABELS[selectedAchievement.rarity]}
            </span>
            <span className="ml-auto font-bold text-orange-500">
              +{selectedAchievement.rewardCurrency} монет
            </span>
          </div>
        )}

        {alreadyAwarded && (
          <p
            className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-700"
            role="status"
          >
            Этот ученик уже получил выбранное достижение. Повторная выдача
            заблокирована.
          </p>
        )}

        <Button type="submit" disabled={!canSubmit} className="self-start">
          Подтвердить выдачу
        </Button>
      </form>
    </section>
  );
}
