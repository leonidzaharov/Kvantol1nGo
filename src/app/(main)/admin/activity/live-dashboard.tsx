"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";

import type {
  ClassroomDashboardSnapshot,
  ClassroomStudentSnapshot,
} from "@/lib/classroom-dashboard-types";

const STATUS_META = {
  not_started: {
    label: "Не начал",
    className: "border-neutral-200 bg-neutral-50 text-neutral-500",
  },
  working: {
    label: "Работает",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  stuck: {
    label: "Нужна помощь",
    className: "border-rose-300 bg-rose-50 text-rose-700",
  },
  completed: {
    label: "Основная часть готова",
    className: "border-green-300 bg-green-50 text-green-700",
  },
  bonus: {
    label: "Решает со звёздочкой",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  bonus_completed: {
    label: "Всё готово",
    className: "border-purple-300 bg-purple-50 text-purple-700",
  },
} as const;

function positionLabel(student: ClassroomStudentSnapshot) {
  if (student.status === "bonus_completed") {
    return "⭐ Дополнительные завершены";
  }
  if (student.status === "completed") {
    return "Основная часть завершена";
  }
  if (student.phase === "theory") return "Читает теорию";
  if (student.phase === "bonus") {
    return `⭐ Задача ${Math.min(
      (student.currentQuestionIndex ?? 0) + 1,
      Math.max(1, student.bonusTotalQuestions),
    )} из ${student.bonusTotalQuestions}`;
  }
  if (student.phase === "completed") return "Основная часть завершена";
  if (student.phase === "tasks") {
    return `Задача ${Math.min(
      (student.currentQuestionIndex ?? 0) + 1,
      Math.max(1, student.totalQuestions),
    )} из ${student.totalQuestions}`;
  }
  return "Урок не открыт";
}

function activityLabel(
  lastActivityAt: string | null,
  generatedAt: string,
) {
  if (!lastActivityAt) return "—";
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(generatedAt).getTime() - new Date(lastActivityAt).getTime()) /
        1000,
    ),
  );
  if (seconds < 15) return "только что";
  if (seconds < 60) return `${seconds} сек. назад`;
  return `${Math.floor(seconds / 60)} мин. назад`;
}

export function LiveDashboard({
  initialSnapshot,
}: {
  initialSnapshot: ClassroomDashboardSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [connectionError, setConnectionError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(
          `/api/admin/class-sessions/${initialSnapshot.session.id}`,
          { cache: "no-store" },
        );
        if (response.status === 404) {
          if (!cancelled) router.refresh();
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as ClassroomDashboardSnapshot;
        if (!cancelled) {
          setSnapshot(next);
          setConnectionError(false);
        }
      } catch {
        if (!cancelled) setConnectionError(true);
      }
    };
    const timer = window.setInterval(() => void load(), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [initialSnapshot.session.id, router]);

  const cards = [
    {
      label: "Не начали",
      value: snapshot.summary.notStarted,
      icon: Clock3,
      className: "bg-neutral-100 text-neutral-600",
    },
    {
      label: "Работают",
      value: snapshot.summary.working,
      icon: BookOpen,
      className: "bg-sky-100 text-sky-700",
    },
    {
      label: "Нужна помощь",
      value: snapshot.summary.stuck,
      icon: AlertTriangle,
      className: "bg-rose-100 text-rose-700",
    },
    {
      label: "Завершили",
      value: snapshot.summary.completed,
      icon: CheckCircle2,
      className: "bg-green-100 text-green-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-neutral-700">
            {snapshot.session.groupName} · {snapshot.session.lessonTitle}
          </h2>
          <p className="text-sm text-neutral-500">
            {snapshot.session.courseName} · обновление каждые 3 секунды
          </p>
        </div>
        <span
          role="status"
          className={
            "rounded-full px-3 py-1 text-xs font-bold " +
            (connectionError
              ? "bg-rose-100 text-rose-700"
              : "bg-green-100 text-green-700")
          }
        >
          {connectionError ? "Нет связи, повторяю…" : "● В эфире"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-2xl p-4 ${card.className}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{card.label}</span>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-2 text-3xl font-black">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-neutral-200">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="p-3">Ученик</th>
              <th className="p-3">Состояние</th>
              <th className="p-3">Текущий шаг</th>
              <th className="p-3">Прогресс</th>
              <th className="p-3">Ошибки здесь</th>
              <th className="p-3">Последнее действие</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.students.map((student) => {
              const meta = STATUS_META[student.status];
              return (
                <tr
                  key={student.id}
                  className="border-t border-neutral-200 text-sm"
                >
                  <td className="p-3 font-bold text-neutral-700">
                    {student.name}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-neutral-600">
                    {positionLabel(student)}
                  </td>
                  <td className="p-3 font-bold text-neutral-600">
                    {student.phase === "bonus"
                      ? `${student.bonusAnsweredCount}/${student.bonusTotalQuestions} ⭐`
                      : `${student.answeredCount}/${student.totalQuestions}`}
                  </td>
                  <td
                    className={
                      "p-3 font-bold " +
                      (student.currentWrongAttempts >= 3
                        ? "text-rose-600"
                        : student.currentWrongAttempts >= 2
                          ? "text-amber-600"
                          : "text-neutral-400")
                    }
                  >
                    {student.currentWrongAttempts}
                  </td>
                  <td className="p-3 text-neutral-500">
                    {activityLabel(
                      student.lastActivityAt,
                      snapshot.generatedAt,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-bold text-neutral-700">
          Проблемные задачи
        </h3>
        {snapshot.problemQuestions.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-neutral-200 p-5 text-center text-neutral-400">
            Ошибок пока нет.
          </p>
        ) : (
          <ul className="space-y-2">
            {snapshot.problemQuestions.map((item) => (
              <li
                key={`${item.section}:${item.questionIndex}`}
                className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4"
              >
                <p className="font-bold text-neutral-700">
                  {item.section === "bonus" ? "⭐ " : ""}
                  Задача {item.questionIndex + 1}: {item.prompt}
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  {item.wrongAttempts} ошибок у {item.studentCount} учеников
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
