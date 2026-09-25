export const CREATOR_LEADERBOARD_ENTRY = {
  id: "kvantolingo-creator",
  name: "Леонид Наставник",
  subtitle: "Создатель KvantoLingo",
  xpLabel: "∞",
  href: "/creator",
  isSystemEntry: true,
  rank: null,
} as const;

export const CREATOR_ACHIEVEMENT = {
  code: "KVANTOLINGO_CREATOR",
  title: "Создатель KvantoLingo",
  description: "Автор и создатель учебной платформы KvantoLingo",
  icon: "👑",
  rarity: "mythic",
  rewardCurrency: 0,
  isSystemOnly: true,
} as const;

export const CREATOR_REGALIA = [
  { icon: "👑", label: "Создатель KvantoLingo" },
  { icon: "⌘", label: "Архитектор платформы" },
  { icon: "🚀", label: "Наставник Кванториума" },
  { icon: "✦", label: "Founder Edition" },
  { icon: "♢", label: "Mythic Profile" },
] as const;

type StudentLeaderboardSource = {
  id: string;
  name: string;
  totalXp: number;
};

export type StudentLeaderboardEntry<T extends StudentLeaderboardSource> = T & {
  href: string;
  isSystemEntry: false;
  rank: number;
  xpLabel: string;
};

export function buildLeaderboardEntries<T extends StudentLeaderboardSource>(
  students: T[],
  currentUserId: string,
): Array<
  typeof CREATOR_LEADERBOARD_ENTRY | StudentLeaderboardEntry<T>
> {
  return [
    CREATOR_LEADERBOARD_ENTRY,
    ...students.map((student, index) => ({
      ...student,
      href: student.id === currentUserId ? "/profile" : `/profile/${student.id}`,
      isSystemEntry: false as const,
      rank: index + 1,
      xpLabel: String(student.totalXp),
    })),
  ];
}
