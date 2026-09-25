"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

// Лёгкий мобильный drawer без Radix/shadcn Sheet — чтобы не тянуть новую
// зависимость. Готовый серверный <Sidebar> прокидывается как children.
export const MobileSidebar = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Открыть меню">
        <Menu className="text-white" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full w-[256px] bg-white shadow-xl">
            <button
              className="absolute right-2 top-2 z-10 p-2 text-neutral-500"
              onClick={() => setOpen(false)}
              aria-label="Закрыть меню"
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
};
