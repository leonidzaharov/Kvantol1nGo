"use client";
import { useEffect } from "react";
import type { JSAnimation } from "animejs";

// One observer for the whole page. At most six visible achievements animate.
export function AchievementEffects() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const selector = '.achievement-rarity[data-state="unlocked"]:is([data-rarity="rare"],[data-rarity="legendary"],[data-rarity="mythic"])';
    const visible = new Set<HTMLElement>();
    const observed = new Set<HTMLElement>();
    const active = new Map<HTMLElement, { layer: HTMLElement; animations: JSAnimation[] }>();
    let cancelled = false;
    let engine: typeof import("animejs") | undefined;
    let loading = false;
    function remove(node: HTMLElement) {
      const effect = active.get(node);
      if (!effect) return;
      effect.animations.forEach((animation) => animation.revert());
      effect.layer.remove();
      active.delete(node);
    }
    function sync() {
      if (cancelled) return;
      const targets = preference.matches || document.hidden ? [] : [...visible].filter((node) => node.isConnected).slice(0, 6);
      for (const node of active.keys()) if (!targets.includes(node)) remove(node);
      if (!targets.length) return;
      if (!engine) {
        if (!loading) {
          loading = true;
          void import("animejs").then((module) => { engine = module; sync(); }).catch(() => { /* static rarity styling remains */ });
        }
        return;
      }
      for (const node of targets) {
        if (active.has(node)) continue;
        const layer = document.createElement("span");
        layer.className = "achievement-motion-layer";
        layer.setAttribute("aria-hidden", "true");
        const shine = document.createElement("span");
        shine.className = "achievement-motion-shine";
        layer.append(shine);
        const emblem = node.querySelector<HTMLElement>(".achievement-emblem");
        (emblem ?? node).append(layer);
        const delay = (observed.size + active.size) % 6 * 320;
        const animations = [engine.animate(shine, { x: ["-150%", "450%"], opacity: [0, .65, 0], duration: 2400, delay, loopDelay: 4200, loop: true, ease: "inOutSine" })];
        const ornate = node.dataset.rarity === "mythic" || node.dataset.rarity === "legendary";
        if (emblem && ornate) {
          const orbit = document.createElement("span");
          orbit.className = "achievement-motion-orbit";
          layer.append(orbit);
          animations.push(engine.animate(orbit, { rotate: [0, node.dataset.rarity === "mythic" ? -360 : 360], duration: 14000, loop: true, ease: "linear" }));
        }
        // Small profile badges only get a sheen; particles frame full-size icons.
        const count = !emblem ? 0 : node.dataset.rarity === "mythic" ? 4 : node.dataset.rarity === "legendary" ? 3 : 0;
        for (let i = 0; i < count; i++) {
          const particle = document.createElement("span");
          particle.className = "achievement-motion-spark";
          particle.style.left = `${i % 2 ? 85 : 10}%`;
          particle.style.top = `${18 + Math.floor(i / 2) * 60}%`;
          layer.append(particle);
          animations.push(engine.animate(particle, { y: [5, -8], scale: [.5, 1.1], opacity: [0, .8, 0], duration: 2100, delay: i * 230, loopDelay: 2600, loop: true, ease: "inOutSine" }));
        }
        active.set(node, { layer, animations });
      }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(node); else visible.delete(node);
      }
      sync();
    }, { threshold: .15 });
    function scan() {
      for (const node of observed) if (!node.isConnected || !node.matches(selector)) {
        observer.unobserve(node); observed.delete(node); visible.delete(node); remove(node);
      }
      document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        if (!observed.has(node)) { observed.add(node); observer.observe(node); }
      });
      sync();
    }
    const mutations = new MutationObserver((records) => {
      // Ignore our decorative nodes; only react to actual React content changes.
      if (records.some((record) => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof HTMLElement && !node.className.startsWith("achievement-motion-")))) scan();
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "data-rarity"] });
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    scan();
    return () => {
      cancelled = true; observer.disconnect(); mutations.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      for (const node of active.keys()) remove(node);
    };
  }, []);
  return null;
}
