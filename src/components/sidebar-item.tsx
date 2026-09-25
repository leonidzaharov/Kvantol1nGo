"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardCheck,
  Compass,
  Medal,
  Sparkles,
  Trophy,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// Иконку выбираем по строковому ключу, а не передаём компонент пропом —
// так серверный <Sidebar> не тянет lucide-компоненты через RSC-границу.
const ICONS: Record<string, LucideIcon> = {
  learn: BookOpen,
  courses: Compass,
  leaderboard: Medal,
  trophy: Trophy,
  profile: User,
  interesting: Sparkles,
  admin: Wrench,
  works: ClipboardCheck,
};

type SidebarItemProps = {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  badge?: number;
};

export const SidebarItem = ({
  label,
  href,
  icon,
  badge = 0,
}: SidebarItemProps) => {
  const pathname = usePathname();
  const isActive = pathname === href;
  const Icon = ICONS[icon];

  return (
    <Button
      variant={isActive ? "sidebarOutline" : "sidebar"}
      className="h-[52px] justify-start"
      asChild
    >
      <Link href={href}>
        <Icon className="mr-5 h-8 w-8" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge > 0 ? (
          <span
            className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-extrabold text-white"
            aria-label={`Требуют исправления: ${badge}`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    </Button>
  );
};
