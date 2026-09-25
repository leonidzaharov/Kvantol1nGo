"use client";

import { useEffect } from "react";

import { ACHIEVEMENT_RARITY_LABELS } from "@/lib/achievement-rarity";
import type { UnlockedAchievement } from "@/lib/achievements";

import "./AchievementToast.css";

const AUTO_DISMISS_MS = 7000;
const MAX_VISIBLE_TOASTS = 3;

type Props = {
  achievements: UnlockedAchievement[];
  onDismiss: (id: number) => void;
};

export function AchievementToastStack({ achievements, onDismiss }: Props) {
  const visible = achievements.slice(0, MAX_VISIBLE_TOASTS);
  if (visible.length === 0) return null;

  return (
    <div
      className="achievement-toast-stack"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {visible.map((achievement) => (
        <Toast
          key={achievement.id}
          achievement={achievement}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function Toast({
  achievement,
  onDismiss,
}: {
  achievement: UnlockedAchievement;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(achievement.id),
      AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [achievement.id, onDismiss]);

  return (
    <article
      className="achievement-toast achievement-rarity"
      data-rarity={achievement.rarity}
      data-state="unlocked"
      role="alert"
    >
      <div
        className="achievement-toast-icon achievement-rarity-label"
        aria-hidden="true"
      >
        {achievement.icon ?? "🏆"}
      </div>

      <div className="achievement-toast-body">
        <div className="achievement-toast-label achievement-rarity-accent">
          Новое достижение ·{" "}
          {ACHIEVEMENT_RARITY_LABELS[achievement.rarity]}
        </div>
        <div className="achievement-toast-title">{achievement.title}</div>
        <div className="achievement-toast-desc">{achievement.description}</div>
        {achievement.rewardCurrency > 0 && (
          <div className="achievement-toast-reward">
            +{achievement.rewardCurrency} монет
          </div>
        )}
      </div>

      <button
        type="button"
        className="achievement-toast-dismiss"
        aria-label="Скрыть уведомление"
        onClick={() => onDismiss(achievement.id)}
      >
        ×
      </button>
    </article>
  );
}
