"use client";

import { Fragment, useState } from "react";

import { StudentRow, type StudentRowProps } from "./student-row";

type Student = StudentRowProps["student"] & { requestId: string };

export function StudentTable({
  students,
  groups,
}: {
  students: Student[];
  groups: StudentRowProps["groups"];
}) {
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-neutral-200" role="region" aria-label="Таблица учеников" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-600">
          <tr>
            <th scope="col" className="px-4 py-3">Ник</th>
            <th scope="col" className="px-4 py-3">Пометка для наставника</th>
            <th scope="col" className="px-4 py-3">Группа</th>
            <th scope="col" className="px-4 py-3">Монеты / пиксели</th>
            <th scope="col" className="px-4 py-3">Профиль</th>
            <th scope="col" className="px-4 py-3">Действие</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const isOpen = openStudentId === student.id;
            return (
              <Fragment key={student.id}>
                <tr className="border-t border-neutral-200 text-neutral-700">
                  <th scope="row" className="max-w-[180px] break-words px-4 py-3 font-bold">{student.name}</th>
                  <td className="max-w-[200px] break-words px-4 py-3">{student.mentorLabel ?? "—"}</td>
                  <td className="px-4 py-3">{student.groupId === null ? "Без группы" : groupNames.get(student.groupId) ?? "Группа удалена"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{student.currency} / {student.pixelsRedeemed} из 60</td>
                  <td className="px-4 py-3">{student.profileConfiguredAt ? "Настроен" : "Первый вход"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenStudentId(isOpen ? null : student.id)}
                      className="rounded-lg px-2 py-1 font-bold text-green-700 hover:bg-green-50"
                    >
                      {isOpen ? "Скрыть" : "Открыть"}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-neutral-200">
                    <td colSpan={6} className="bg-neutral-50 p-3 sm:p-4">
                      <StudentRow student={student} groups={groups} requestId={student.requestId} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
