"use client";

import { Moon, Sun } from "lucide-react";

/** Inline script that applies the saved/system theme before paint (no flash). */
export const themeScript = `(function(){try{var t=localStorage.getItem('uh-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try {
          localStorage.setItem("uh-theme", dark ? "dark" : "light");
        } catch {
          /* storage unavailable */
        }
      }}
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
    </button>
  );
}
