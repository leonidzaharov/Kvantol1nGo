"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

type GroupOption = { id: number; name: string };
type StudentOption = {
  id: string;
  name: string;
  groupId: number | null;
  groupName: string | null;
};

type AudienceSelectorProps = {
  groups: GroupOption[];
  students: StudentOption[];
  initialGroupIds?: number[];
  initialUserIds?: string[];
};

export function AudienceSelector({
  groups,
  students,
  initialGroupIds = [],
  initialUserIds = [],
}: AudienceSelectorProps) {
  const [selectedGroupIds, setSelectedGroupIds] =
    useState<number[]>(initialGroupIds);
  const [selectedUserIds, setSelectedUserIds] =
    useState<string[]>(initialUserIds);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filteredStudents = useMemo(
    () =>
      normalizedQuery === ""
        ? students
        : students.filter((student) =>
            `${student.name} ${student.groupName ?? ""}`
              .toLocaleLowerCase("ru")
              .includes(normalizedQuery),
          ),
    [normalizedQuery, students],
  );
  const selectedGroups = groups.filter((group) =>
    selectedGroupIds.includes(group.id),
  );
  const selectedStudents = students.filter((student) =>
    selectedUserIds.includes(student.id),
  );

  function toggleGroup(groupId: number): void {
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  function toggleStudent(userId: string): void {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  return (
    <fieldset className="space-y-5 rounded-2xl border-2 border-neutral-200 p-4">
      <legend className="px-2 font-bold text-neutral-700">Кому назначить</legend>
      <p className="text-sm text-neutral-500">
        Можно выбрать целые группы, отдельных учеников или оба варианта.
        Совпадение не создаст дубликат.
      </p>

      {selectedGroupIds.map((id) => (
        <input key={`group-${id}`} type="hidden" name="groupId" value={id} />
      ))}
      {selectedUserIds.map((id) => (
        <input key={`user-${id}`} type="hidden" name="userId" value={id} />
      ))}

      <div>
        <p className="mb-2 text-sm font-bold text-neutral-700">Группы</p>
        {groups.length === 0 ? (
          <p className="text-sm text-amber-700">Сначала создайте группу.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-50 p-3"
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                  className="h-5 w-5 accent-green-600"
                />
                <span className="font-medium text-neutral-700">
                  {group.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="student-search"
          className="mb-2 block text-sm font-bold text-neutral-700"
        >
          Отдельные ученики
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-neutral-400" />
          <input
            id="student-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя или группа"
            className="w-full rounded-xl border-2 border-neutral-200 py-3 pl-10 pr-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none"
          />
        </div>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-neutral-200 p-2">
          {filteredStudents.length === 0 ? (
            <p className="p-3 text-sm text-neutral-400">Никого не найдено.</p>
          ) : (
            filteredStudents.map((student) => (
              <label
                key={student.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(student.id)}
                  onChange={() => toggleStudent(student.id)}
                  className="h-5 w-5 accent-green-600"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-700">
                    {student.name}
                  </span>
                  <span className="block text-xs text-neutral-400">
                    {student.groupName ?? "Без группы"}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {selectedGroups.length + selectedStudents.length > 0 ? (
        <div aria-live="polite">
          <p className="mb-2 text-sm font-bold text-neutral-700">Выбрано</p>
          <div className="flex flex-wrap gap-2">
            {selectedGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-label={`Убрать группу ${group.name}`}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-800"
              >
                Группа: {group.name}
                <X className="h-4 w-4" />
              </button>
            ))}
            {selectedStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => toggleStudent(student.id)}
                aria-label={`Убрать ученика ${student.name}`}
                className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1.5 text-sm font-bold text-sky-800"
              >
                {student.name}
                <X className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
          Черновик можно сохранить без аудитории, но опубликовать — нельзя.
        </p>
      )}
    </fieldset>
  );
}
