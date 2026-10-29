"use client";

import { FxBreadcrumb } from "@forge/fx-layouts";
import { FxCard, FxTable } from "@forge/fx-ui";
import { useResponsive } from "@forge/fx-hooks";

const WIDTHS = [1920, 1600, 1440, 1366, 1280, 1024, 768, 600, 430, 390, 375, 320];

export default function ValidationPage() {
  const { width, isPhone, isTablet, isDesktop, isOpsDisplay } = useResponsive();

  return (
    <>
      <FxBreadcrumb items={[{ label: "Validation" }]} />
      <h1 style={{ fontFamily: "var(--fx-font-display)", fontSize: 28 }}>
        Accessibility, responsive & theme
      </h1>
      <FxCard title="Live viewport">
        <p>
          Current width: <strong>{width}px</strong> · Phone: {String(isPhone)} · Tablet:{" "}
          {String(isTablet)} · Desktop: {String(isDesktop)} · Ops display: {String(isOpsDisplay)}
        </p>
        <p className="fx-card__body">
          Use browser device mode to hit checklist widths. Theme control is in the shell header
          (tokens only).
        </p>
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Responsive checklist widths">
        <FxTable
          caption="Target widths"
          columns={["Width", "Notes"]}
          rows={WIDTHS.map((w) => [String(w), w === width ? "≈ current" : "Validate manually"])}
        />
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Accessibility checklist (manual)">
        <ul>
          <li>Keyboard: Tab through header, nav, main actions; visible focus ring</li>
          <li>Screen reader: landmarks (banner/nav/main/contentinfo), tablist on workspace</li>
          <li>Contrast: light / dark / high-contrast themes</li>
          <li>Reduced motion: OS preference zeroes motion tokens</li>
          <li>Touch: controls ≥ 44×44 CSS px</li>
          <li>Tables: column headers present</li>
        </ul>
        <p className="fx-field__hint">
          Document findings in docs/forge-experience/reference/a11y-validation-log.md
        </p>
      </FxCard>
    </>
  );
}
