"use client";

import { FxBreadcrumb } from "@forge/fx-layouts";
import {
  FxAlert,
  FxAreaChart,
  FxBarChart,
  FxButton,
  FxCard,
  FxDonutChart,
  FxEmptyState,
  FxKpiTrendCard,
  FxLineChart,
  FxLoadingRegion,
  FxMapPanel,
  FxPieChart,
  FxSkeleton,
  FxStatusBadge,
  FxTextField,
  FxWeatherAlertBanner,
  FxWeatherCurrentCard,
  FxWeatherForecastCard,
} from "@forge/fx-ui";

const DEMO_SERIES = [
  { label: "A", value: 10 },
  { label: "B", value: 16 },
  { label: "C", value: 12 },
  { label: "D", value: 20 },
];

function StateRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--fx-space-8)", marginBottom: "var(--fx-space-24)" }}>
      <h3 style={{ margin: 0 }}>{label}</h3>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--fx-space-8)",
          alignItems: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <>
      <FxBreadcrumb items={[{ label: "Playground" }]} />
      <h1 style={{ fontFamily: "var(--fx-font-display)", fontSize: 28 }}>Component playground</h1>
      <p className="fx-card__body">
        Every control below inherits FX tokens. Switch theme from the shell header to validate light
        / dark / high-contrast. Resize the viewport for responsive checks.
      </p>
      <FxCard title="Buttons">
        <StateRow label="Default / tones">
          <FxButton>Primary</FxButton>
          <FxButton tone="secondary">Secondary</FxButton>
          <FxButton tone="danger">Danger</FxButton>
          <FxButton tone="ghost">Ghost</FxButton>
        </StateRow>
        <StateRow label="Disabled / loading">
          <FxButton disabled>Disabled</FxButton>
          <FxButton loading>Loading</FxButton>
        </StateRow>
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Badges & fields">
        <StateRow label="Status">
          <FxStatusBadge tone="success">Success</FxStatusBadge>
          <FxStatusBadge tone="warning">Warning</FxStatusBadge>
          <FxStatusBadge tone="danger">Danger</FxStatusBadge>
          <FxStatusBadge tone="info">Info</FxStatusBadge>
          <FxStatusBadge tone="neutral">Neutral</FxStatusBadge>
        </StateRow>
        <FxTextField id="pg-1" label="Text field" hint="Focus for ring" />
        <div style={{ height: "var(--fx-space-12)" }} />
        <FxTextField id="pg-2" label="Error field" error="Example error" defaultValue="bad" />
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Feedback">
        <FxAlert tone="success" title="Success">
          Saved (demo).
        </FxAlert>
        <div style={{ height: "var(--fx-space-8)" }} />
        <FxAlert tone="danger" title="Danger">
          Action failed (demo).
        </FxAlert>
        <div style={{ height: "var(--fx-space-16)" }} />
        <FxEmptyState
          title="No inspections have been assigned."
          description="Create an inspection or adjust filters. You need import.view-equivalent permission in products."
          action={<FxButton>Create inspection</FxButton>}
        />
        <FxLoadingRegion label="Loading region" />
        <FxSkeleton height="2rem" />
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Charts (reference)">
        <div style={{ display: "grid", gap: "var(--fx-space-16)" }}>
          <FxLineChart title="Line" data={DEMO_SERIES} />
          <FxBarChart title="Bar" data={DEMO_SERIES} />
          <FxAreaChart title="Area" data={DEMO_SERIES} />
          <FxPieChart title="Pie" data={DEMO_SERIES} />
          <FxDonutChart title="Donut" data={DEMO_SERIES} />
          <FxKpiTrendCard label="KPI trend" value="42" delta="+3%" series={DEMO_SERIES} />
        </div>
      </FxCard>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxCard title="Map & weather (reference)">
        <div style={{ display: "grid", gap: "var(--fx-space-16)" }}>
          <FxMapPanel
            markers={[
              { id: "1", label: "Alpha", x: 100, y: 80, tone: "info" },
              { id: "2", label: "Bravo", x: 220, y: 140, tone: "warning" },
            ]}
          />
          <FxWeatherAlertBanner />
          <FxWeatherCurrentCard />
          <FxWeatherForecastCard />
        </div>
      </FxCard>
    </>
  );
}
