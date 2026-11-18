"use client";

import { FxBreadcrumb, FxDashboardLayout, FxGridItem, FxResponsiveGrid } from "@forge/fx-layouts";
import {
  FxAlert,
  FxAreaChart,
  FxBarChart,
  FxButton,
  FxCard,
  FxDonutChart,
  FxKpiTrendCard,
  FxLineChart,
  FxMapPanel,
  FxMetricCard,
  FxPieChart,
  FxStatusBadge,
  FxTable,
  FxWeatherAlertBanner,
  FxWeatherCurrentCard,
  FxWeatherForecastCard,
} from "@forge/fx-ui";

const TREND = [
  { label: "Mon", value: 12 },
  { label: "Tue", value: 18 },
  { label: "Wed", value: 15 },
  { label: "Thu", value: 22 },
  { label: "Fri", value: 19 },
];

const MIX = [
  { label: "Inspections", value: 42 },
  { label: "Approvals", value: 18 },
  { label: "Incidents", value: 7 },
  { label: "Training", value: 23 },
];

const MARKERS = [
  { id: "m1", label: "Station Alpha", x: 80, y: 70, tone: "info" as const },
  { id: "m2", label: "Incident Zone", x: 210, y: 120, tone: "danger" as const },
  { id: "m3", label: "Staging", x: 320, y: 90, tone: "warning" as const },
  { id: "m4", label: "Ready unit", x: 150, y: 180, tone: "success" as const },
  { id: "m5", label: "Alpha support", x: 95, y: 85, tone: "info" as const },
  { id: "m6", label: "Alpha medic", x: 70, y: 95, tone: "info" as const },
];

export default function DashboardPage() {
  return (
    <FxDashboardLayout title="Operational dashboard">
      <FxBreadcrumb items={[{ label: "Operations", href: "/" }, { label: "Dashboard" }]} />
      <FxAlert tone="warning" title="Synthetic reference data only">
        Widgets use static demo values. No RMS, Academy, or Industrial APIs are called.
      </FxAlert>
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxWeatherAlertBanner />
      <div style={{ height: "var(--fx-space-16)" }} />
      <FxResponsiveGrid>
        <FxGridItem span={3}>
          <FxMetricCard label="Open tasks" value="12" hint="My Work queue" />
        </FxGridItem>
        <FxGridItem span={3}>
          <FxMetricCard label="Pending approvals" value="4" hint="Needs review" />
        </FxGridItem>
        <FxGridItem span={3}>
          <FxMetricCard label="Overdue" value="2" hint="Critical attention" />
        </FxGridItem>
        <FxGridItem span={3}>
          <FxKpiTrendCard label="Throughput" value="128" delta="+8%" series={TREND} />
        </FxGridItem>
        <FxGridItem span={4}>
          <FxWeatherCurrentCard />
        </FxGridItem>
        <FxGridItem span={4}>
          <FxWeatherForecastCard />
        </FxGridItem>
        <FxGridItem span={4}>
          <FxCard title="Quick actions">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--fx-space-8)" }}>
              <FxButton>New inspection</FxButton>
              <FxButton tone="secondary">Log incident</FxButton>
              <FxButton tone="secondary">Assign work</FxButton>
            </div>
          </FxCard>
        </FxGridItem>
        <FxGridItem span={6}>
          <FxLineChart title="Weekly volume" data={TREND} />
        </FxGridItem>
        <FxGridItem span={6}>
          <FxBarChart title="Queue mix" data={MIX} />
        </FxGridItem>
        <FxGridItem span={6}>
          <FxAreaChart title="Capacity envelope" data={TREND} />
        </FxGridItem>
        <FxGridItem span={3}>
          <FxPieChart title="Work types" data={MIX} />
        </FxGridItem>
        <FxGridItem span={3}>
          <FxDonutChart title="Work types (donut)" data={MIX} />
        </FxGridItem>
        <FxGridItem span={12}>
          <FxMapPanel title="Operational map" markers={MARKERS} />
        </FxGridItem>
        <FxGridItem span={6}>
          <FxCard
            title="Queue summary"
            actions={<FxStatusBadge tone="danger">2 overdue</FxStatusBadge>}
          >
            <FxTable
              caption="Work queues"
              columns={["Queue", "Count", "Status"]}
              rows={[
                [
                  "Inspections",
                  "8",
                  <FxStatusBadge key="a" tone="warning">
                    Attention
                  </FxStatusBadge>,
                ],
                [
                  "Approvals",
                  "4",
                  <FxStatusBadge key="b" tone="info">
                    Needs review
                  </FxStatusBadge>,
                ],
                [
                  "Incidents",
                  "1",
                  <FxStatusBadge key="c" tone="danger">
                    Open
                  </FxStatusBadge>,
                ],
              ]}
            />
          </FxCard>
        </FxGridItem>
        <FxGridItem span={6}>
          <FxCard title="Activity feed">
            <ul>
              <li>Inspection #1042 assigned — 10 minutes ago</li>
              <li>Permit draft saved offline — 25 minutes ago</li>
              <li>Training session completed — 1 hour ago</li>
            </ul>
          </FxCard>
        </FxGridItem>
      </FxResponsiveGrid>
    </FxDashboardLayout>
  );
}
