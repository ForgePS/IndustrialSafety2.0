"use client";

import { useEffect, useState } from "react";

export type IndustrialThemeMode = "light" | "dark";

const STORAGE_KEY = "forge-ind-theme-mode";
export const INDUSTRIAL_THEME_EVENT = "forge-ind-theme-mode";

function readStoredMode(): IndustrialThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "dark" ? "dark" : "light";
}

export function applyIndustrialTheme(mode: IndustrialThemeMode): void {
  const root = document.documentElement;
  root.setAttribute("data-bs-theme", mode);
  root.setAttribute("data-theme", "theme-default");
  root.classList.toggle("light-style", mode === "light");
  root.classList.toggle("dark-style", mode === "dark");
  root.classList.add("layout-menu-fixed");
  // Help native form controls follow the canvas.
  root.style.colorScheme = mode;
  window.dispatchEvent(new CustomEvent(INDUSTRIAL_THEME_EVENT, { detail: { mode } }));
}

/** Subscribe to current Industrial light/dark preference. */
export function useIndustrialThemeMode(): IndustrialThemeMode {
  const [mode, setMode] = useState<IndustrialThemeMode>("light");

  useEffect(() => {
    const initial = readStoredMode();
    setMode(initial);
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<{ mode: IndustrialThemeMode }>).detail?.mode;
      if (next === "light" || next === "dark") setMode(next);
    };
    window.addEventListener(INDUSTRIAL_THEME_EVENT, onChange);
    return () => window.removeEventListener(INDUSTRIAL_THEME_EVENT, onChange);
  }, []);

  return mode;
}

/**
 * Navbar control: switches Sneat light/dark via data-bs-theme (Pro logistics palette).
 * Preference persists in localStorage across reloads.
 */
export function ThemeModeToggle() {
  const [mode, setMode] = useState<IndustrialThemeMode>("light");

  useEffect(() => {
    const initial = readStoredMode();
    setMode(initial);
    applyIndustrialTheme(initial);
  }, []);

  function toggle() {
    const next: IndustrialThemeMode = mode === "light" ? "dark" : "light";
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyIndustrialTheme(next);
  }

  const isDark = mode === "dark";

  return (
    <button
      type="button"
      className="btn btn-sm btn-icon btn-outline-secondary"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      onClick={toggle}
    >
      <i className={`bx ${isDark ? "bx-sun" : "bx-moon"} bx-sm`} aria-hidden="true" />
    </button>
  );
}
