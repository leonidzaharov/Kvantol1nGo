"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

// ============================================================
// Декоративный фон экрана «Учить»: мягкие размытые круги в фирменных
// цветах, медленно парящие за змейкой уроков (anime.js).
//
// На работу экрана не влияет: клики проходят насквозь
// (pointer-events-none), от скринридеров скрыт (aria-hidden), лежит
// позади всего (-z-10), а на десктопе начинается правее сайдбара.
// Если в системе включено «уменьшить движение» — круги неподвижны.
// ============================================================

// Позиции зашиты константой (не random), чтобы серверный и клиентский
// рендер совпадали и фон не «прыгал» при загрузке.
const BLOBS = [
  { left: "8%", top: "10%", size: 150, color: "bg-green-300" },
  { left: "78%", top: "6%", size: 110, color: "bg-yellow-300" },
  { left: "88%", top: "38%", size: 170, color: "bg-sky-300" },
  { left: "4%", top: "52%", size: 120, color: "bg-purple-300" },
  { left: "70%", top: "72%", size: 150, color: "bg-green-300" },
  { left: "16%", top: "84%", size: 100, color: "bg-orange-300" },
  { left: "46%", top: "26%", size: 90, color: "bg-sky-300" },
  { left: "38%", top: "90%", size: 130, color: "bg-yellow-300" },
];

export function AnimatedBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const blobs =
      rootRef.current?.querySelectorAll<HTMLElement>("[data-blob]");
    if (!blobs || blobs.length === 0) {
      return;
    }

    // Каждому кругу — своя длительность и задержка, чтобы дышали не в такт.
    const animations = Array.from(blobs).map((blob, i) =>
      animate(blob, {
        translateY: [-18, 18],
        translateX: [-12, 12],
        scale: [0.9, 1.08],
        duration: 4200 + (i % 5) * 1100,
        delay: (i % 4) * 320,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
    );
    return () => {
      animations.forEach((animation) => animation.revert());
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden lg:left-[256px]"
    >
      {BLOBS.map((blob, i) => (
        <div
          key={i}
          data-blob
          className={`absolute rounded-full opacity-30 blur-2xl ${blob.color}`}
          style={{
            left: blob.left,
            top: blob.top,
            width: blob.size,
            height: blob.size,
          }}
        />
      ))}
    </div>
  );
}
