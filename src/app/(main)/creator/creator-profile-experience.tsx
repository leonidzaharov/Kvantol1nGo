"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Crown, Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { JSAnimation } from "animejs";
import { CREATOR_ACHIEVEMENT, CREATOR_LEADERBOARD_ENTRY, CREATOR_REGALIA } from "@/lib/creator-profile";
import styles from "./creator-profile.module.css";

// ============================================================
// Сердце из точек. Вся геометрия считается один раз на уровне модуля и только
// из целочисленного шума, поэтому серверный и клиентский рендер совпадают.
// ============================================================

const CENTER = 300;
const HEART_SCALE = 10;
const HEART_LAYERS = [
  { scale: 1, count: 56, radius: 5.6 },
  { scale: 0.84, count: 46, radius: 4.6 },
  { scale: 0.68, count: 36, radius: 3.7 },
  { scale: 0.52, count: 26, radius: 2.9 },
  { scale: 0.37, count: 16, radius: 2.2 },
];
const TICK_COUNT = 96;
const SEGMENT_COLORS = ["#ff626b", "#ffbb51", "#68ed9b", "#38ddd5", "#699fff", "#b394ff", "#ff87b5", "#c8f871"];
const SEGMENT_RADIUS = 268;
const SEGMENT_LENGTH = 138;

/** Детерминированный шум 0..1 на целых операциях (без Math.random). */
function noise(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const round = (value: number) => Math.round(value * 10) / 10;

function heartPoint(t: number) {
  const x = 16 * Math.sin(t) ** 3;
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x, y: y + 2.2 };
}

// Половина контура t ∈ [0, π] с накопленной длиной дуги: вторая половина
// сердца получается зеркалированием, поэтому выемка и кончик лежат строго
// на оси и слои не расходятся.
const HALF_CONTOUR = (() => {
  const steps = 720;
  const points: { x: number; y: number }[] = [];
  const cumulative = [0];
  for (let i = 0; i <= steps; i += 1) {
    const point = heartPoint((i / steps) * Math.PI);
    if (i > 0) {
      const previous = points[i - 1];
      cumulative.push(cumulative[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    }
    points.push(point);
  }
  return { points, cumulative, total: cumulative[steps] };
})();

function pointAtArc(arc: number) {
  const index = HALF_CONTOUR.cumulative.findIndex((length) => length >= arc);
  return HALF_CONTOUR.points[index < 0 ? HALF_CONTOUR.points.length - 1 : index];
}

// В каждом слое точка ровно в выемке, точка ровно на кончике и зеркальные
// пары между ними — по центральной оси выстраивается аккуратная колонка.
const HEART_DOTS = HEART_LAYERS.flatMap((layer, layerIndex) => {
  const pairCount = (layer.count - 2) / 2;
  const spots: { x: number; y: number; seed: number }[] = [
    { ...pointAtArc(0), seed: 0 },
    { ...pointAtArc(HALF_CONTOUR.total), seed: 1 },
    ...Array.from({ length: pairCount }, (_, i) => ({
      ...pointAtArc((HALF_CONTOUR.total * (i + 1)) / (pairCount + 1)),
      seed: i + 2,
    })).flatMap((spot) => [spot, { ...spot, x: -spot.x }]),
  ];
  return spots.map((point, index) => {
    const seed = layerIndex * 1000 + point.seed;
    return {
      key: `${layerIndex}-${index}`,
      layer: layerIndex,
      cx: round(CENTER + point.x * HEART_SCALE * layer.scale),
      cy: round(CENTER - point.y * HEART_SCALE * layer.scale),
      r: round(layer.radius * (0.7 + noise(seed + 13) * 0.6)),
      opacity: round(0.5 + noise(seed + 29) * 0.5),
    };
  });
});

const TICKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  const angle = (index / TICK_COUNT) * Math.PI * 2;
  const long = index % 8 === 0;
  const inner = long ? 228 : 234;
  const outer = 244;
  return {
    key: index,
    x1: round(CENTER + Math.cos(angle) * inner),
    y1: round(CENTER + Math.sin(angle) * inner),
    x2: round(CENTER + Math.cos(angle) * outer),
    y2: round(CENTER + Math.sin(angle) * outer),
    opacity: long ? 0.7 : 0.35,
  };
});

const SEGMENT_GAP = round(Math.PI * 2 * SEGMENT_RADIUS - SEGMENT_LENGTH);

const baseRadius = (target: unknown) => Number((target as SVGElement).dataset.r ?? 0);
const baseOpacity = (target: unknown) => Number((target as SVGElement).dataset.o ?? 1);

export function CreatorProfileExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowId = useId();
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let visible = true;
    const animations: JSAnimation[] = [];
    const syncPlayback = () => {
      animations.forEach((animation) => {
        if (visible && !document.hidden) animation.resume();
        else animation.pause();
      });
    };

    void import("animejs").then(({ animate, stagger }) => {
      if (cancelled) return;
      animations.push(
        // Волна дыхания идёт от внешнего контура к свободному центру.
        animate(root.querySelectorAll("[data-heart-dot]"), {
          r: { from: (target: unknown) => baseRadius(target) * 0.55, to: (target: unknown) => baseRadius(target) * 1.18 },
          opacity: { from: (target: unknown) => baseOpacity(target) * 0.4, to: (target: unknown) => baseOpacity(target) },
          duration: 1500, delay: stagger([0, 1100]), ease: "inOutSine", alternate: true, loop: true,
        }),
        animate(root.querySelectorAll("[data-heart-pulse]"), {
          scale: [1, 1.045, 1, 1.025, 1], duration: 2600, ease: "inOutQuad", loop: true,
        }),
        animate(root.querySelectorAll("[data-segment]"), {
          opacity: [0.45, 1], duration: 1400, delay: stagger(170), ease: "inOutSine", alternate: true, loop: true,
        }),
        animate(root.querySelectorAll("[data-orbit]"), { rotate: 360, duration: 72000, ease: "linear", loop: true }),
        animate(root.querySelectorAll("[data-inner-orbit]"), { rotate: -360, duration: 40000, ease: "linear", loop: true }),
        animate(root.querySelectorAll("[data-ticks]"), { rotate: 360, duration: 240000, ease: "linear", loop: true }),
      );
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncPlayback();
      });
      observer.observe(root);
      document.addEventListener("visibilitychange", syncPlayback);
      syncPlayback();
    }).catch(() => {
      // The static illustration and profile remain usable if animation cannot load.
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      animations.forEach((animation) => animation.revert());
    };
  }, [paused, reducedMotion]);

  return (
    <div ref={rootRef} className={styles.profile} data-creator-profile>
      <header className={styles.topbar}>
        <Link href="/leaderboard" className={styles.back}><ArrowLeft size={16} /> В рейтинг</Link>
        <span className={styles.edition}>KVANTOLINGO / FOUNDER EDITION</span>
        <span className={styles.serial}>№ 001</span>
      </header>

      <section className={styles.hero} aria-labelledby="creator-name">
        <div className={styles.identity}>
          <p className={styles.eyebrow}><span /> За каждой идеей — человек</p>
          <h1 id="creator-name">Леонид<span>Наставник<span className={styles.period}>.</span></span></h1>
          <p className={styles.subtitle}>{CREATOR_LEADERBOARD_ENTRY.subtitle}</p>
          <p className={styles.description}>Место, где любопытство превращается в знания, а первые строчки кода — в большие идеи.</p>
          <div className={styles.signature}><span className={styles.signatureLine} /> Сделано с сердцем</div>
        </div>

        <div className={styles.visual}>
          <div className={styles.instrument} aria-hidden="true">
            <div className={styles.halo} />
            <svg viewBox="0 0 600 600" className={styles.canvas}>
              <defs>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <g className={styles.rings} fill="none" stroke="currentColor">
                <circle cx={CENTER} cy={CENTER} r="292" strokeWidth="1" strokeOpacity=".55" />
                <circle cx={CENTER} cy={CENTER} r="284" strokeWidth=".75" strokeOpacity=".35" strokeDasharray="2 6" />
                <circle cx={CENTER} cy={CENTER} r="252" strokeWidth="1" strokeOpacity=".5" />
                <circle cx={CENTER} cy={CENTER} r="222" strokeWidth=".75" strokeOpacity=".3" />
                <circle cx={CENTER} cy={CENTER} r="196" strokeWidth=".75" strokeOpacity=".2" strokeDasharray="1 5" />
              </g>

              <g className={styles.ticks} data-ticks stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                {TICKS.map((tick) => (
                  <line key={tick.key} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} strokeOpacity={tick.opacity} />
                ))}
              </g>

              <g className={styles.orbit} data-orbit fill="none" strokeWidth="5" strokeLinecap="round" filter={`url(#${glowId})`}>
                {SEGMENT_COLORS.map((color, index) => (
                  <circle key={color} data-segment cx={CENTER} cy={CENTER} r={SEGMENT_RADIUS} stroke={color} strokeDasharray={`${SEGMENT_LENGTH} ${SEGMENT_GAP}`} transform={`rotate(${index * 45 - 90} ${CENTER} ${CENTER})`} />
                ))}
              </g>

              <g className={styles.innerOrbit} data-inner-orbit fill="none" stroke="currentColor" strokeLinecap="round">
                <circle cx={CENTER} cy={CENTER} r="214" strokeWidth="1.5" strokeDasharray="190 1155" />
                <circle cx={CENTER} cy={CENTER} r="207" strokeWidth="1" strokeOpacity=".5" strokeDasharray="120 1181" transform={`rotate(150 ${CENTER} ${CENTER})`} />
                <circle cx={CENTER} cy={CENTER} r="214" strokeWidth="1.5" strokeOpacity=".7" strokeDasharray="60 1285" transform={`rotate(230 ${CENTER} ${CENTER})`} />
              </g>

              <g className={styles.heart} data-heart-pulse fill="currentColor">
                {HEART_DOTS.map((dot) => (
                  <circle key={dot.key} data-heart-dot data-layer={dot.layer} data-r={dot.r} data-o={dot.opacity} cx={dot.cx} cy={dot.cy} r={dot.r} opacity={dot.opacity} />
                ))}
              </g>
            </svg>
            <span className={styles.heartCaption}>ЛЮБОПЫТСТВО. КОД. ЛЮБОВЬ.</span>
          </div>
          <div className={styles.visualFooter}>
            <span className={styles.signal}><i /> Сердце платформы</span>
            <button type="button" className={styles.motionButton} onClick={() => setPaused((value) => !value)} aria-pressed={paused || reducedMotion} disabled={reducedMotion} aria-label={reducedMotion ? "Анимация отключена настройками устройства" : paused ? "Включить анимацию" : "Приостановить анимацию"}>
              {paused || reducedMotion ? <Play size={13} /> : <Pause size={13} />}
              {reducedMotion ? "Без движения" : paused ? "Продолжить" : "Пауза"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.details} aria-label="О создателе">
        <article className={styles.achievement}>
          <div className={styles.medal}><Crown size={25} strokeWidth={1.4} /></div>
          <div><p className={styles.cardLabel}>Особое достижение <span>Мифическое</span></p><h2>{CREATOR_ACHIEVEMENT.title}</h2><p>{CREATOR_ACHIEVEMENT.description}</p></div>
          <span className={styles.cardNumber}>001</span>
        </article>
        <div className={styles.experience}><span className={styles.infinity} aria-label="Бесконечность">{CREATOR_LEADERBOARD_ENTRY.xpLabel}</span><span>XP<span>Интерес без границ</span></span></div>
      </section>
      <footer className={styles.footer}>
        <div className={styles.regalia} aria-label="Регалии создателя">{CREATOR_REGALIA.slice(1).map((item) => <span key={item.label}>{item.label}</span>)}</div>
        <Link href="/learn" className={styles.learn}>Продолжить учиться <ArrowUpRight size={16} /></Link>
      </footer>
    </div>
  );
}
