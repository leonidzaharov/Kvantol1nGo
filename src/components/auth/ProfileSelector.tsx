"use client";

import { useEffect, useRef, useState } from "react";
import { StudentAvatar } from "@/components/student-avatar";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import type { GroupTrack } from "@/generated/prisma";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProfileLite = {
  id: string;
  name: string;
  level: number; avatarId?: string;
};

export type GroupWithStudents = {
  id: number;
  name: string;
  track: GroupTrack;
  students: ProfileLite[];
};

type Props = {
  groups: GroupWithStudents[];
  /** Ученики без группы — показываются отдельной карточкой «Без группы». */
  ungrouped: ProfileLite[];
};

// Выбранное «направление»: обычный трек или спец-раздел для учеников,
// которых наставник ещё не распределил по группам.
type TrackChoice = GroupTrack | "ungrouped";



export function ProfileSelector({ groups, ungrouped }: Props) {
  const [track, setTrack] = useState<TrackChoice | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pinRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Показываем только направления, где есть группы, — пустая карточка
  // вела бы в тупик.
  const tracks = TRACK_ORDER.filter((t) =>
    groups.some((g) => g.track === t),
  );
  const trackGroups = groups.filter((g) => g.track === track);
  const activeGroup = groups.find((g) => g.id === groupId) ?? null;
  const students =
    track === "ungrouped" ? ungrouped : activeGroup?.students ?? [];
  const selected = students.find((p) => p.id === selectedId) ?? null;

  // Сброс полей делаем в обработчиках выбора (не в эффекте — иначе каскадный
  // ре-рендер). Эффект оставляем только под DOM-фокус, без setState.
  const selectProfile = (id: string) => {
    setSelectedId(id);
    setPin("");
    setError("");
  };

  useEffect(() => {
    if (selectedId) pinRef.current?.focus();
  }, [selectedId]);

  const goBack = () => {
    setError("");
    setPin("");
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    if (groupId) {
      setGroupId(null);
      return;
    }
    setTrack(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || pin.length !== 4 || submitting) return;
    setSubmitting(true);
    setError("");

    const res = await signIn("credentials", {
      redirect: false,
      userId: selected.id,
      pin,
    });

    if (res?.error) {
      // Auth.js v5 прокидывает наш RateLimitedError.code через res.code.
      setError(
        res.code === "rate_limited"
          ? "Слишком много неудачных попыток. Подожди 5 минут."
          : "Неверный PIN-код",
      );
      setPin("");
      setSubmitting(false);
      pinRef.current?.focus();
      return;
    }

    router.push("/learn");
    router.refresh();
  };

  // Подзаголовок текущего шага.
  const subtitle =
    track === null
      ? "Выбери своё направление"
      : track === "ungrouped"
        ? "Выбери свой профиль"
        : groupId === null
          ? `${TRACK_LABELS[track]} · выбери свою группу`
          : `${activeGroup?.name ?? ""} · выбери свой профиль`;

  const hasProfiles = groups.length > 0 || ungrouped.length > 0;

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold tracking-wide text-green-600 lg:text-4xl">
          Кванториум
        </h1>
        <p className="mt-3 text-lg font-bold text-neutral-500">{subtitle}</p>
      </header>

      {track !== null && (
        <button
          type="button"
          onClick={goBack}
          className="mb-6 flex items-center gap-x-2 font-bold text-neutral-400 transition hover:text-neutral-600"
        >
          <ArrowLeft className="h-5 w-5" />
          Назад
        </button>
      )}

      {!hasProfiles ? (
        <div className="max-w-md rounded-xl border-2 p-6 text-center font-bold text-neutral-500">
          Профилей пока нет. Запусти seed-скрипт, чтобы создать тестового
          ученика.
        </div>
      ) : track === null ? (
        // ── Шаг 1: направление ──
        <div className="grid w-full max-w-[720px] grid-cols-1 gap-4 sm:grid-cols-3">
          {tracks.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrack(t)}
              className="rounded-xl border-2 border-b-4 p-6 text-center transition hover:bg-black/5 active:border-b-2"
            >
              <div className="text-xl font-extrabold text-neutral-700">
                {TRACK_LABELS[t]}
              </div>
              <div className="mt-1 text-xs font-bold text-neutral-400">
                {groups.filter((g) => g.track === t).length} гр.
              </div>
            </button>
          ))}
          {ungrouped.length > 0 && (
            <button
              type="button"
              onClick={() => setTrack("ungrouped")}
              className="rounded-xl border-2 border-b-4 border-dashed p-6 text-center transition hover:bg-black/5 active:border-b-2"
            >
              <div className="text-xl font-extrabold text-neutral-500">
                Без группы
              </div>
              <div className="mt-1 text-xs font-bold text-neutral-400">
                {ungrouped.length} уч.
              </div>
            </button>
          )}
        </div>
      ) : track !== "ungrouped" && groupId === null ? (
        // ── Шаг 2: группа ──
        <div className="grid w-full max-w-[720px] grid-cols-2 gap-4 sm:grid-cols-4">
          {trackGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              className="rounded-xl border-2 border-b-4 p-6 text-center transition hover:bg-black/5 active:border-b-2"
            >
              <div className="text-lg font-extrabold uppercase text-neutral-700">
                {g.name}
              </div>
              <div className="mt-1 text-xs font-bold text-neutral-400">
                {g.students.length} уч.
              </div>
            </button>
          ))}
        </div>
      ) : (
        // ── Шаг 3: ученик ──
        <div className="grid w-full max-w-[960px] grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {students.length === 0 ? (
            <p className="col-span-full rounded-xl border-2 border-dashed p-6 text-center font-bold text-neutral-400">
              В этой группе пока никого нет.
            </p>
          ) : (
            students.map((p) => {
              const isActive = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProfile(p.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex flex-col items-center gap-y-3 rounded-xl border-2 border-b-4 p-4 text-center transition hover:bg-black/5 active:border-b-2",
                    isActive && "border-green-300 bg-green-100 hover:bg-green-100",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-xl font-extrabold text-white",
                      isActive && "bg-green-600",
                    )}
                  >
                    <StudentAvatar avatarId={p.avatarId} size={56} />
                  </div>

                  <div className="w-full truncate font-bold text-neutral-700">
                    {p.name}
                  </div>
                  <div className="text-xs font-bold text-neutral-400">
                    Ур. {p.level}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {selected && (
        <form
          onSubmit={handleSubmit}
          className="mt-8 w-full max-w-[380px] rounded-xl border-2 border-b-4 p-6"
        >
          <div className="mb-4 text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
              Вход
            </div>
            <div className="mt-1 text-xl font-bold text-neutral-700">
              {selected.name}
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border-2 border-rose-200 bg-rose-100 p-2 text-center text-sm font-bold text-rose-500">
              {error}
            </div>
          )}

          <label
            htmlFor="profile-pin"
            className="mb-2 block text-center text-xs font-bold uppercase tracking-wide text-neutral-400"
          >
            PIN-код
          </label>
          <input
            id="profile-pin"
            ref={pinRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border-2 bg-neutral-50 py-3 text-center text-3xl tracking-[0.6em] outline-none focus:border-green-400"
            placeholder="••••"
            autoComplete="off"
            required
          />

          <div className="mt-5 flex gap-x-2">
            <Button
              type="button"
              variant="default"
              className="flex-1"
              onClick={() => setSelectedId(null)}
            >
              Назад
            </Button>
            <Button
              type="submit"
              variant="secondary"
              className="flex-1"
              disabled={pin.length !== 4 || submitting}
            >
              {submitting ? "Вход…" : "Войти"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
