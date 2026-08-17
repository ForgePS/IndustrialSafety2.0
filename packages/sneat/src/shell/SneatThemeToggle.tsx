"use client";

import { useEffect, useState } from "react";

export type SneatThemeMode = "light" | "dark";

const STORAGE_KEY = "forge-sneat-theme-mode";

function readMode(): SneatThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function applyMode(mode: SneatThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-bs-theme", mode);
  document.documentElement.classList.toggle("dark-style", mode === "dark");
  document.documentElement.classList.toggle("light-style", mode === "light");
}

export function useSneatThemeMode() {
  const [mode, setMode] = useState<SneatThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = readMode();
    setMode(next);
    applyMode(next);
    setReady(true);
  }, []);

  function setThemeMode(next: SneatThemeMode) {
    setMode(next);
    applyMode(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }

  function toggleThemeMode() {
    setThemeMode(mode === "dark" ? "light" : "dark");
  }

  return { mode, ready, setThemeMode, toggleThemeMode };
}

export function SneatThemeToggle({ className = "" }: { className?: string }) {
  const { mode, ready, toggleThemeMode } = useSneatThemeMode();
  if (!ready) {
    return (
      <button type="button" className={`btn btn-sm btn-icon btn-outline-secondary ${className}`.trim()} disabled aria-label="Theme">
        <i className="icon-base bx bx-moon" />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn btn-sm btn-icon btn-outline-secondary ${className}`.trim()}
      onClick={toggleThemeMode}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
    >
      <i className={`icon-base bx ${mode === "dark" ? "bx-sun" : "bx-moon"}`} />
    </button>
  );
}
