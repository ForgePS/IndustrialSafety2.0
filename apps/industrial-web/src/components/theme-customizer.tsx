"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  DEFAULT_PRIMARY,
  DEFAULT_TEMPLATE_SETTINGS,
  OPEN_THEME_CUSTOMIZER_EVENT,
  PRIMARY_COLOR_PRESETS,
  TEMPLATE_SETTINGS_EVENT,
  applyTemplateSettings,
  readTemplateSettings,
  settingsAreDefault,
  writeTemplateSettings,
  type IndustrialTemplateSettings,
  type ThemeContentWidth,
  type ThemeDirection,
  type ThemeLayout,
  type ThemeModePreference,
  type ThemeSkin,
} from "@/lib/theme-customizer-settings";
import { requestCustomizeDashboard } from "@/lib/dashboard-layout";

type OptionCardProps = {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function OptionCard({ selected, label, onClick, children }: OptionCardProps) {
  return (
    <button
      type="button"
      className={`ind-theme-customizer__option${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="ind-theme-customizer__option-preview" aria-hidden="true">
        {children}
      </span>
      <span className="ind-theme-customizer__option-label">{label}</span>
    </button>
  );
}

function SectionBadge({ children }: { children: React.ReactNode }) {
  return <span className="ind-theme-customizer__badge">{children}</span>;
}

export function ThemeCustomizer() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<IndustrialTemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    const initial = readTemplateSettings();
    setSettings(initial);
    applyTemplateSettings(initial);
    setCustomOpen(
      !PRIMARY_COLOR_PRESETS.some(
        (p) => p.main.toUpperCase() === initial.primaryColor.toUpperCase(),
      ),
    );

    const onSystem = () => {
      const current = readTemplateSettings();
      if (current.mode === "system") applyTemplateSettings(current);
    };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", onSystem);

    const onExternal = (event: Event) => {
      const next = (event as CustomEvent<{ settings: IndustrialTemplateSettings }>).detail
        ?.settings;
      if (next) setSettings(next);
    };
    window.addEventListener(TEMPLATE_SETTINGS_EVENT, onExternal);

    const onOpenRequest = () => setOpen(true);
    window.addEventListener(OPEN_THEME_CUSTOMIZER_EVENT, onOpenRequest);

    return () => {
      mq?.removeEventListener?.("change", onSystem);
      window.removeEventListener(TEMPLATE_SETTINGS_EVENT, onExternal);
      window.removeEventListener(OPEN_THEME_CUSTOMIZER_EVENT, onOpenRequest);
    };
  }, []);

  const dirty = useMemo(() => !settingsAreDefault(settings), [settings]);

  function update(partial: Partial<IndustrialTemplateSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      writeTemplateSettings(next);
      applyTemplateSettings(next);
      return next;
    });
  }

  function reset() {
    const next = { ...DEFAULT_TEMPLATE_SETTINGS };
    setSettings(next);
    writeTemplateSettings(next);
    applyTemplateSettings(next);
    setCustomOpen(false);
  }

  function setMode(mode: ThemeModePreference) {
    update({ mode });
  }

  function setSkin(skin: ThemeSkin) {
    update({ skin });
  }

  function setLayout(layout: ThemeLayout) {
    update({ layout });
  }

  function setContentWidth(contentWidth: ThemeContentWidth) {
    update({ contentWidth });
  }

  function setDirection(direction: ThemeDirection) {
    update({ direction });
  }

  function setPrimary(primaryColor: string) {
    update({ primaryColor });
  }

  const isPreset = PRIMARY_COLOR_PRESETS.some(
    (p) => p.main.toUpperCase() === settings.primaryColor.toUpperCase(),
  );

  return (
    <>
      {open ? (
        <button
          type="button"
          className="ind-theme-customizer__backdrop"
          aria-label="Close customizer"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="ind-theme-customizer-panel"
        className={`ind-theme-customizer${open ? " is-open" : ""}`}
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <div className="ind-theme-customizer__header">
          <div>
            <h2 id={titleId} className="ind-theme-customizer__title">
              Customize
            </h2>
            <p className="ind-theme-customizer__subtitle mb-0">
              Dashboard layout, theme, and display
            </p>
          </div>
          <div className="d-flex align-items-center gap-1">
            <button
              type="button"
              className="btn btn-icon btn-sm btn-text-secondary position-relative"
              title="Reset"
              aria-label="Reset theme settings"
              onClick={reset}
            >
              <i className="bx bx-reset bx-sm" aria-hidden="true" />
              {dirty ? (
                <span className="ind-theme-customizer__dirty-dot" aria-hidden="true" />
              ) : null}
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm btn-text-secondary"
              title="Close"
              aria-label="Close customizer"
              onClick={() => setOpen(false)}
            >
              <i className="bx bx-x bx-sm" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="ind-theme-customizer__body">
          <SectionBadge>Dashboard</SectionBadge>
          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Layout</div>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100"
              onClick={() => {
                setOpen(false);
                requestCustomizeDashboard();
              }}
            >
              <i className="bx bx-grid-alt me-1" aria-hidden="true" />
              Customize dashboard
            </button>
            <p className="text-muted small mt-2 mb-0">
              Reorder, resize, or hide dashboard blocks and workspace modules.
            </p>
          </div>

          <SectionBadge>Theming</SectionBadge>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Primary Color</div>
            <div className="ind-theme-customizer__swatches">
              {PRIMARY_COLOR_PRESETS.map((preset) => {
                const selected = settings.primaryColor.toUpperCase() === preset.main.toUpperCase();
                return (
                  <button
                    key={preset.main}
                    type="button"
                    className={`ind-theme-customizer__swatch${selected ? " is-selected" : ""}`}
                    style={{ backgroundColor: preset.main }}
                    title={preset.name}
                    aria-label={`Primary color ${preset.name}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setCustomOpen(false);
                      setPrimary(preset.main);
                    }}
                  />
                );
              })}
              <button
                type="button"
                className={`ind-theme-customizer__swatch ind-theme-customizer__swatch--picker${
                  customOpen || !isPreset ? " is-selected" : ""
                }`}
                title="Custom color"
                aria-label="Custom primary color"
                aria-pressed={customOpen || !isPreset}
                onClick={() => setCustomOpen((v) => !v)}
              >
                <i className="bx bx-eyedropper" aria-hidden="true" />
              </button>
            </div>
            {customOpen || !isPreset ? (
              <div className="mt-2">
                <label className="form-label small" htmlFor="ind-theme-custom-primary">
                  Custom hex
                </label>
                <div className="d-flex gap-2 align-items-center">
                  <input
                    id="ind-theme-custom-primary"
                    type="color"
                    className="form-control form-control-color"
                    value={
                      /^#([0-9a-fA-F]{6})$/.test(settings.primaryColor)
                        ? settings.primaryColor
                        : DEFAULT_PRIMARY
                    }
                    onChange={(e) => setPrimary(e.target.value.toUpperCase())}
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={settings.primaryColor}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (/^#([0-9a-fA-F]{0,6})$/.test(v)) setPrimary(v.toUpperCase() || "#");
                    }}
                    onBlur={() => {
                      if (!/^#([0-9a-fA-F]{6})$/.test(settings.primaryColor)) {
                        setPrimary(DEFAULT_PRIMARY);
                      }
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Mode</div>
            <div className="ind-theme-customizer__options ind-theme-customizer__options--3">
              <OptionCard
                label="Light"
                selected={settings.mode === "light"}
                onClick={() => setMode("light")}
              >
                <i className="bx bx-sun" />
              </OptionCard>
              <OptionCard
                label="Dark"
                selected={settings.mode === "dark"}
                onClick={() => setMode("dark")}
              >
                <i className="bx bx-moon" />
              </OptionCard>
              <OptionCard
                label="System"
                selected={settings.mode === "system"}
                onClick={() => setMode("system")}
              >
                <i className="bx bx-desktop" />
              </OptionCard>
            </div>
          </div>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Skin</div>
            <div className="ind-theme-customizer__options ind-theme-customizer__options--2">
              <OptionCard
                label="Default"
                selected={settings.skin === "default"}
                onClick={() => setSkin("default")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--skin-default" />
              </OptionCard>
              <OptionCard
                label="Bordered"
                selected={settings.skin === "bordered"}
                onClick={() => setSkin("bordered")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--skin-bordered" />
              </OptionCard>
            </div>
          </div>

          <SectionBadge>Layout</SectionBadge>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Layouts</div>
            <div className="ind-theme-customizer__options ind-theme-customizer__options--3">
              <OptionCard
                label="Vertical"
                selected={settings.layout === "vertical"}
                onClick={() => setLayout("vertical")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--layout-vertical" />
              </OptionCard>
              <OptionCard
                label="Collapsed"
                selected={settings.layout === "collapsed"}
                onClick={() => setLayout("collapsed")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--layout-collapsed" />
              </OptionCard>
              <OptionCard
                label="Horizontal"
                selected={settings.layout === "horizontal"}
                onClick={() => setLayout("horizontal")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--layout-horizontal" />
              </OptionCard>
            </div>
          </div>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Content</div>
            <div className="ind-theme-customizer__options ind-theme-customizer__options--2">
              <OptionCard
                label="Compact"
                selected={settings.contentWidth === "compact"}
                onClick={() => setContentWidth("compact")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--content-compact" />
              </OptionCard>
              <OptionCard
                label="Wide"
                selected={settings.contentWidth === "wide"}
                onClick={() => setContentWidth("wide")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--content-wide" />
              </OptionCard>
            </div>
          </div>

          <div className="ind-theme-customizer__section">
            <div className="ind-theme-customizer__section-title">Direction</div>
            <div className="ind-theme-customizer__options ind-theme-customizer__options--2">
              <OptionCard
                label="Left to right"
                selected={settings.direction === "ltr"}
                onClick={() => setDirection("ltr")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--dir-ltr" />
              </OptionCard>
              <OptionCard
                label="Right to left"
                selected={settings.direction === "rtl"}
                onClick={() => setDirection("rtl")}
              >
                <span className="ind-theme-customizer__wire ind-theme-customizer__wire--dir-rtl" />
              </OptionCard>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
