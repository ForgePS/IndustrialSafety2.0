"use client";

import { useEffect, useState } from "react";
import {
  TEMPLATE_SETTINGS_EVENT,
  applyTemplateSettings,
  readTemplateSettings,
  requestOpenThemeCustomizer,
  resolveThemeMode,
  writeTemplateSettings,
  type IndustrialTemplateSettings,
} from "@/lib/theme-customizer-settings";

export type IndustrialThemeMode = "light" | "dark";

export const INDUSTRIAL_THEME_EVENT = "forge-ind-theme-mode";

/** Resolved light/dark (system already evaluated). */
export function resolveIndustrialThemeMode(): IndustrialThemeMode {
  if (typeof window === "undefined") return "light";
  return resolveThemeMode(readTemplateSettings().mode);
}

export function applyIndustrialTheme(mode: IndustrialThemeMode): void {
  const settings = readTemplateSettings();
  const next = { ...settings, mode };
  writeTemplateSettings(next);
  applyTemplateSettings(next);
  window.dispatchEvent(new CustomEvent(INDUSTRIAL_THEME_EVENT, { detail: { mode } }));
}

/** Subscribe to current Industrial light/dark preference (resolved). */
export function useIndustrialThemeMode(): IndustrialThemeMode {
  const [mode, setMode] = useState<IndustrialThemeMode>("light");

  useEffect(() => {
    const sync = () => setMode(resolveIndustrialThemeMode());
    sync();
    applyTemplateSettings(readTemplateSettings());

    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ resolvedMode?: IndustrialThemeMode }>).detail;
      if (detail?.resolvedMode === "light" || detail?.resolvedMode === "dark") {
        setMode(detail.resolvedMode);
      } else {
        sync();
      }
    };
    window.addEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => {
      const settings = readTemplateSettings();
      if (settings.mode === "system") {
        applyTemplateSettings(settings);
        sync();
      }
    };
    mq?.addEventListener?.("change", onSystem);

    return () => {
      window.removeEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);
      mq?.removeEventListener?.("change", onSystem);
    };
  }, []);

  return mode;
}

/**
 * Navbar control: opens the customize panel (theme + dashboard layout).
 * Icon reflects current theme preference; click no longer cycles — use the panel.
 */
export function ThemeModeToggle({ openCustomizer = false }: { openCustomizer?: boolean } = {}) {
  const [settings, setSettings] = useState<IndustrialTemplateSettings | null>(null);

  useEffect(() => {
    const initial = readTemplateSettings();
    setSettings(initial);
    applyTemplateSettings(initial);

    const onSettings = (event: Event) => {
      const next = (event as CustomEvent<{ settings: IndustrialTemplateSettings }>).detail
        ?.settings;
      if (next) setSettings(next);
    };
    window.addEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);
  }, []);

  function cycle() {
    const current = settings ?? readTemplateSettings();
    const nextMode: IndustrialTemplateSettings["mode"] =
      current.mode === "light" ? "dark" : current.mode === "dark" ? "system" : "light";
    const next: IndustrialTemplateSettings = { ...current, mode: nextMode };
    setSettings(next);
    writeTemplateSettings(next);
    applyTemplateSettings(next);
  }

  const preference = settings?.mode ?? "system";
  const resolved = settings ? resolveThemeMode(settings.mode) : "light";
  const icon =
    preference === "system" ? "bx-desktop" : resolved === "dark" ? "bx-sun" : "bx-moon";
  const label = openCustomizer
    ? "Customize"
    : preference === "system"
      ? "Theme: System (click for Light)"
      : preference === "dark"
        ? "Theme: Dark (click for System)"
        : "Theme: Light (click for Dark)";

  return (
    <button
      type="button"
      className="btn btn-sm btn-icon btn-outline-secondary"
      aria-label={label}
      title={label}
      aria-controls={openCustomizer ? "ind-theme-customizer-panel" : undefined}
      onClick={() => {
        if (openCustomizer) {
          requestOpenThemeCustomizer();
          return;
        }
        cycle();
      }}
    >
      <i className={`bx ${icon} bx-sm`} aria-hidden="true" />
    </button>
  );
}
