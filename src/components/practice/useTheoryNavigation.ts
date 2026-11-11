"use client";

import { useEffect, useRef, useState } from "react";

/** Reading theory changes the screen, without resetting the mounted practice. */
export function useTheoryNavigation() {
  const [page, setPage] = useState<number | null>(null);
  const returnTo = useRef<{ element: HTMLElement | null; scrollY: number } | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function open() {
    cancelAnimationFrame(frame.current);
    returnTo.current = {
      element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      scrollY: window.scrollY,
    };
    setPage(0);
  }

  function close() {
    setPage(null);
    frame.current = requestAnimationFrame(() => {
      const target = returnTo.current;
      if (!target) return;
      window.scrollTo({ top: target.scrollY, behavior: "instant" });
      target.element?.focus({ preventScroll: true });
    });
  }

  return { page, setPage, open, close };
}
