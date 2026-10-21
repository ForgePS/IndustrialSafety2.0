"use client";

import { useEffect, useState } from "react";
import {
  FIELD_THEME_EVENT,
  applyFieldTheme,
  readFieldThemePreference,
  resolveFieldTheme,
  writeFieldThemePreference,
  type FieldResolvedTheme,
  type FieldThemePreference,
} from "@/lib/field-theme";

const OPTIONS: { value: FieldThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function useFieldThemeMode() {
  const [preference, setPreference] = useState<FieldThemePreference>("system");
  const [resolved, setResolved] = useState<FieldResolvedTheme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const pref = readFieldThemePreference();
      const next = resolveFieldTheme(pref);
      setPreference(pref);
      setResolved(next);
      applyFieldTheme(next);
      setReady(true);
    };
    sync();

    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<{ preference?: FieldThemePreference; resolved?: FieldResolvedTheme }>)
        .detail;
      if (detail?.preference) setPreference(detail.preference);
      if (detail?.resolved === "light" || detail?.resolved === "dark") {
        setResolved(detail.resolved);
      } else {
        sync();
      }
    };
    window.addEventListener(FIELD_THEME_EVENT, onTheme);

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readFieldThemePreference() === "system") {
        const next = resolveFieldTheme("system");
        setResolved(next);
        applyFieldTheme(next);
      }
    };
    mq?.addEventListener?.("change", onSystem);

    return () => {
      window.removeEventListener(FIELD_THEME_EVENT, onTheme);
      mq?.removeEventListener?.("change", onSystem);
    };
  }, []);

  function setThemePreference(next: FieldThemePreference) {
    setPreference(next);
    const resolvedNext = writeFieldThemePreference(next);
    setResolved(resolvedNext);
  }

  return { preference, resolved, ready, setThemePreference };
}

/** Appearance control for Me / settings. */
export function FieldThemeSettings() {
  const { preference, ready, setThemePreference } = useFieldThemeMode();

  return (
    <section className="ff-section" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="ff-section-title">
        Appearance
      </h2>
      <p className="ff-hint ff-hint--left">Choose light, dark, or match your device.</p>
      <div className="ff-theme-seg" role="group" aria-label="Theme">
        {OPTIONS.map((opt) => {
          const active = ready && preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`ff-theme-seg__btn${active ? " ff-theme-seg__btn--active" : ""}`}
              aria-pressed={active}
              disabled={!ready}
              onClick={() => setThemePreference(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
