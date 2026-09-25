export const STUDENT_AVATARS = [
  { id: "fox", label: "Лисёнок", src: "/avatars/fox.webp" },
  { id: "robot", label: "Робот", src: "/avatars/robot.webp" },
  { id: "owl", label: "Сова", src: "/avatars/owl.webp" },
  { id: "astronaut", label: "Космонавт", src: "/avatars/astronaut.webp" },
  { id: "dinosaur", label: "Динозавр", src: "/avatars/dinosaur.webp" },
] as const;
export type StudentAvatarId = (typeof STUDENT_AVATARS)[number]["id"];
export function getStudentAvatar(id: string | null | undefined) {
  return STUDENT_AVATARS.find((avatar) => avatar.id === id) ?? STUDENT_AVATARS[0];
}
