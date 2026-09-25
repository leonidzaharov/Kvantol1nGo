import Image from "next/image";
import { getStudentAvatar } from "@/lib/student-avatars";
export function StudentAvatar({ avatarId, size = 48 }: { avatarId?: string | null; size?: number }) {
  const avatar = getStudentAvatar(avatarId);
  return <Image src={avatar.src} alt="" width={size} height={size} unoptimized className="shrink-0 rounded-full border-2 border-white/50 object-cover" style={{ imageRendering: "pixelated", width: size, height: size }} />;
}
