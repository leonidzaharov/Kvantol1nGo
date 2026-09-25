"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { acknowledgeAchievementNotifications } from "@/lib/actions/achievements";
import type { UnlockedAchievement } from "@/lib/achievements";

import { AchievementToastStack } from "./AchievementToast";

export function AchievementNotificationCenter({
  initialAchievements,
}: {
  initialAchievements: UnlockedAchievement[];
}) {
  const [queue, setQueue] = useState(initialAchievements);
  const acknowledged = useRef(new Set<number>());
  const visible = queue.slice(0, 3);
  const visibleIds = visible.map((achievement) => achievement.id).join(",");

  useEffect(() => {
    const ids = visibleIds
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => !acknowledged.current.has(id));
    if (ids.length === 0) return;

    ids.forEach((id) => acknowledged.current.add(id));
    void acknowledgeAchievementNotifications(ids).catch(() => {
      ids.forEach((id) => acknowledged.current.delete(id));
    });
  }, [visibleIds]);

  const dismiss = useCallback((id: number) => {
    setQueue((current) =>
      current.filter((achievement) => achievement.id !== id),
    );
  }, []);

  return (
    <AchievementToastStack achievements={visible} onDismiss={dismiss} />
  );
}
