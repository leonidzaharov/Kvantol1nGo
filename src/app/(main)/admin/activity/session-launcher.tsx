"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { startClassSession } from "@/lib/actions/classroom";

export type LauncherGroup = {
  id: number;
  name: string;
  courses: {
    id: number;
    name: string;
    lessons: { id: number; title: string }[];
  }[];
};

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 bg-white p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";

export function SessionLauncher({ groups }: { groups: LauncherGroup[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? 0);
  const group = groups.find((item) => item.id === groupId);
  const [courseId, setCourseId] = useState(group?.courses[0]?.id ?? 0);
  const course =
    group?.courses.find((item) => item.id === courseId) ?? group?.courses[0];
  const [lessonId, setLessonId] = useState(course?.lessons[0]?.id ?? 0);

  const currentLessonId = course?.lessons.some(
    (item) => item.id === lessonId,
  )
    ? lessonId
    : (course?.lessons[0]?.id ?? 0);

  const changeGroup = (nextGroupId: number) => {
    const nextGroup = groups.find((item) => item.id === nextGroupId);
    const nextCourse = nextGroup?.courses[0];
    setGroupId(nextGroupId);
    setCourseId(nextCourse?.id ?? 0);
    setLessonId(nextCourse?.lessons[0]?.id ?? 0);
  };

  const changeCourse = (nextCourseId: number) => {
    const nextCourse = group?.courses.find((item) => item.id === nextCourseId);
    setCourseId(nextCourseId);
    setLessonId(nextCourse?.lessons[0]?.id ?? 0);
  };

  return (
    <form
      action={startClassSession}
      className="grid gap-3 rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <label className="space-y-1">
        <span className="text-sm font-bold text-neutral-600">Группа</span>
        <select
          name="groupId"
          value={groupId}
          onChange={(event) => changeGroup(Number(event.target.value))}
          className={inputClass}
        >
          {groups.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-bold text-neutral-600">Курс</span>
        <select
          value={course?.id ?? 0}
          onChange={(event) => changeCourse(Number(event.target.value))}
          className={inputClass}
          disabled={!group || group.courses.length === 0}
        >
          {group?.courses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-bold text-neutral-600">Урок</span>
        <select
          name="lessonId"
          value={currentLessonId}
          onChange={(event) => setLessonId(Number(event.target.value))}
          className={inputClass}
          disabled={!course || course.lessons.length === 0}
        >
          {course?.lessons.map((item, index) => (
            <option key={item.id} value={item.id}>
              {index + 1}. {item.title}
            </option>
          ))}
        </select>
      </label>

      <Button
        type="submit"
        variant="secondary"
        className="self-end"
        disabled={!groupId || !currentLessonId}
      >
        Начать занятие
      </Button>

      {groups.length === 0 && (
        <p className="text-sm text-amber-600 md:col-span-4">
          Сначала создайте группу.
        </p>
      )}
      {group && group.courses.length === 0 && (
        <p className="text-sm text-amber-600 md:col-span-4">
          У этой группы нет опубликованных курсов и уроков.
        </p>
      )}
    </form>
  );
}
