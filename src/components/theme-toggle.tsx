"use client";

import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "kvantolingo-theme";

export function ThemeToggle() {
  const toggleTheme = () => {
    const root = document.documentElement;
    const useDarkTheme = root.dataset.theme !== "dark";

    if (useDarkTheme) {
      root.dataset.theme = "dark";
    } else {
      root.removeAttribute("data-theme");
    }

    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        useDarkTheme ? "dark" : "light",
      );
    } catch {
      // Тема всё равно переключится до следующей перезагрузки.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Переключить светлую и тёмную тему"
      title="Светлая / тёмная тема"
      className="theme-toggle fixed right-3 top-3 z-[100] flex h-11 w-11 items-center justify-center rounded-xl border-2 border-b-4 border-green-600 bg-green-500 text-white shadow-sm transition hover:bg-green-600 active:translate-y-0.5 active:border-b-2 sm:right-4 sm:top-4"
    >
      <Moon aria-hidden="true" className="theme-toggle__moon h-5 w-5" />
      <Sun aria-hidden="true" className="theme-toggle__sun h-5 w-5" />
    </button>
  );
}
