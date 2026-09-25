"use client";

import { useTransition } from "react";

import { setActiveCourse } from "@/lib/actions/course";

import { Card } from "./card";

type Course = { id: number; name: string; icon: string | null };

type ListProps = {
  courses: Course[];
  activeCourseId?: number;
};

export const List = ({ courses, activeCourseId }: ListProps) => {
  const [pending, startTransition] = useTransition();

  const onClick = (id: number) => {
    if (pending) return;
    // setActiveCourse пишет cookie и делает redirect('/learn') на сервере.
    startTransition(() => {
      void setActiveCourse(id);
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4 pt-6 lg:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
      {courses.map((course) => (
        <Card
          key={course.id}
          id={course.id}
          title={course.name}
          icon={course.icon}
          onClick={onClick}
          disabled={pending}
          isActive={course.id === activeCourseId}
        />
      ))}
    </div>
  );
};
