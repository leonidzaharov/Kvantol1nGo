"use client";
import { useActionState } from "react";
import { chooseStudentAvatar } from "@/lib/actions/student-avatar";
import { STUDENT_AVATARS } from "@/lib/student-avatars";
import { StudentAvatar } from "@/components/student-avatar";
export function AvatarPicker({ avatarId }: { avatarId: string }) {
  const [state, action, pending] = useActionState(chooseStudentAvatar, null);
  return <form action={action} className="mx-auto mb-8 max-w-lg rounded-2xl border-2 p-4">
    <fieldset disabled={pending}><legend className="mb-3 font-bold text-neutral-700">Выбери своего героя</legend>
      <div className="grid grid-cols-5 gap-1 sm:gap-3">{STUDENT_AVATARS.map((avatar) => <label key={avatar.id} className="min-w-0 cursor-pointer text-center">
        <input type="radio" name="avatarId" value={avatar.id} defaultChecked={avatar.id === avatarId} className="peer sr-only" required />
        <span className="inline-flex rounded-full border-2 border-transparent p-1 peer-checked:border-green-500 peer-focus-visible:outline-2 peer-focus-visible:outline-sky-500"><StudentAvatar avatarId={avatar.id} size={44} /></span>
        <span className="block text-[10px] font-bold text-neutral-600 sm:text-xs">{avatar.label}</span>
      </label>)}</div>
      <button className="mt-4 w-full rounded-xl bg-green-600 px-4 py-2 font-bold text-white disabled:opacity-50" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить аватар"}</button>
    </fieldset><p role="status" className="mt-2 text-center text-sm">{state?.error ?? state?.success}</p>
  </form>;
}
