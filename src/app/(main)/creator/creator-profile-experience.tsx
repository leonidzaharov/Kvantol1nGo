"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Crown, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { JSAnimation } from "animejs";
import { CREATOR_ACHIEVEMENT, CREATOR_LEADERBOARD_ENTRY, CREATOR_REGALIA } from "@/lib/creator-profile";
import styles from "./creator-profile.module.css";

// A deterministic dot matrix keeps the server and browser render identical.
const DOTS = Array.from({ length: 21 * 21 }, (_, index) => {
  const column = index % 21;
  const row = Math.floor(index / 21);
  const x = (column - 10) / 8;
  const y = (10 - row) / 8;
  return { column, row, inside: (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0 };
}).filter((dot) => dot.inside);
const COLORS = ["#ff626b", "#ffbb51", "#68ed9b", "#38ddd5", "#699fff", "#b394ff", "#ff87b5", "#c8f871"];

export function CreatorProfileExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
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

    void import("animejs").then(({ animate }) => {
      if (cancelled) return;
      animations.push(
        animate(root.querySelectorAll("[data-heart-dot]"), {
          scale: [0.62, 1.12, 0.76, 1, 0.62],
          opacity: [0.4, 1, 0.65, 0.9, 0.4],
          duration: 2400,
          delay: (_target: unknown, index = 0) => {
            const dot = DOTS[index];
            return Math.hypot(dot.column - 10, dot.row - 9) * 65;
          },
          ease: "inOutSine", loop: true,
        }),
        animate(root.querySelectorAll("[data-orbit]"), {
          rotate: [0, 360], duration: 80000, ease: "linear", loop: true,
        }),
        animate(root.querySelectorAll("[data-inner-orbit]"), {
          rotate: [0, -360], duration: 42000, ease: "linear", loop: true,
        }),
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
            <div className={styles.outerRim} />
            <div className={styles.orbit} data-orbit>
              <svg viewBox="0 0 600 600" className={styles.rings}>
                {COLORS.map((color, index) => (
                  <circle key={color} cx="300" cy="300" r="272" fill="none" stroke={color} strokeWidth="4" strokeDasharray="192 1517" transform={`rotate(${index * 45 - 90} 300 300)`} />
                ))}
              </svg>
            </div>
            <div className={styles.ticks} />
            <div className={styles.innerRim} />
            <div className={styles.innerOrbit} data-inner-orbit>
              <svg viewBox="0 0 600 600" className={styles.rings}>
                <circle cx="300" cy="300" r="222" fill="none" stroke="#ffc5a2" strokeWidth="1.5" strokeDasharray="210 1185" />
                <circle cx="300" cy="300" r="214" fill="none" stroke="#ffc5a2" strokeOpacity=".45" strokeWidth="1" strokeDasharray="145 1200" />
              </svg>
            </div>
            <div className={styles.heart}>
              {DOTS.map(({ column, row }) => (
                <span key={`${column}-${row}`} data-heart-dot className={styles.dot} style={{ left: `${column * 5}%`, top: `${row * 5}%` }} />
              ))}
            </div>
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
