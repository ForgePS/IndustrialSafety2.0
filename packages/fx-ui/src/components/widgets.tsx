import { useState, type ReactNode } from "react";
import { cn } from "@forge/fx-utils";
import { FxCard, FxStatusBadge } from "./primitives.js";

export type FxChartPoint = { label: string; value: number };

const SERIES = [
  "var(--fx-color-action-primary)",
  "var(--fx-color-status-info)",
  "var(--fx-color-status-success)",
  "var(--fx-color-status-warning)",
  "var(--fx-color-status-danger)",
];

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <FxCard title={title}>
      <p className="fx-field__hint" style={{ marginBottom: "var(--fx-space-12)" }}>
        {description}
      </p>
      {children}
    </FxCard>
  );
}

/** Accessible SVG line chart — reference data only. */
export function FxLineChart({
  title = "Trend",
  data,
  unit = "",
}: {
  title?: string;
  data: FxChartPoint[];
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 320;
  const h = 120;
  const pts = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * (w - 24) + 12;
      const y = h - 16 - (d.value / max) * (h - 32);
      return `${x},${y}`;
    })
    .join(" ");
  const summary = data.map((d) => `${d.label}: ${d.value}${unit}`).join("; ");
  return (
    <ChartFrame title={title} description="Line chart (synthetic reference series).">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={140}
        role="img"
        aria-label={`${title}. ${summary}`}
      >
        <polyline
          fill="none"
          stroke="var(--fx-color-action-primary)"
          strokeWidth="2"
          points={pts}
        />
        {data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * (w - 24) + 12;
          const y = h - 16 - (d.value / max) * (h - 32);
          return <circle key={d.label} cx={x} cy={y} r="3" fill="var(--fx-color-action-primary)" />;
        })}
      </svg>
      <table className="fx-table">
        <caption className="fx-field__hint">Data table alternative</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>
                {d.value}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}

export function FxBarChart({
  title = "Comparison",
  data,
}: {
  title?: string;
  data: FxChartPoint[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const summary = data.map((d) => `${d.label}: ${d.value}`).join("; ");
  return (
    <ChartFrame title={title} description="Bar chart (synthetic reference series).">
      <div
        role="img"
        aria-label={`${title}. ${summary}`}
        style={{ display: "grid", gap: "var(--fx-space-8)" }}
      >
        {data.map((d, i) => (
          <div
            key={d.label}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(72px, 88px) 1fr 40px",
              gap: "var(--fx-space-8)",
              alignItems: "center",
            }}
          >
            <span className="fx-field__hint">{d.label}</span>
            <div className="fx-chart-bar-track">
              <div
                className="fx-chart-bar-fill"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: SERIES[i % SERIES.length],
                }}
              />
            </div>
            <span>{d.value}</span>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

export function FxAreaChart({ title = "Volume", data }: { title?: string; data: FxChartPoint[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 320;
  const h = 120;
  const line = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * (w - 24) + 12;
      const y = h - 16 - (d.value / max) * (h - 32);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `12,${h - 16} ${line} ${w - 12},${h - 16}`;
  const summary = data.map((d) => `${d.label}: ${d.value}`).join("; ");
  return (
    <ChartFrame title={title} description="Area chart (synthetic reference series).">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={140}
        role="img"
        aria-label={`${title}. ${summary}`}
      >
        <polygon points={area} fill="var(--fx-color-status-info)" opacity="0.35" />
        <polyline fill="none" stroke="var(--fx-color-status-info)" strokeWidth="2" points={line} />
      </svg>
    </ChartFrame>
  );
}

export function FxPieChart({
  title = "Distribution",
  data,
  donut = false,
}: {
  title?: string;
  data: FxChartPoint[];
  donut?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let angle = -90;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const start = angle;
    angle += sweep;
    const large = sweep > 180 ? 1 : 0;
    const r = 40;
    const cx = 50;
    const cy = 50;
    const rad = (deg: number) => (Math.PI / 180) * deg;
    const x1 = cx + r * Math.cos(rad(start));
    const y1 = cy + r * Math.sin(rad(start));
    const x2 = cx + r * Math.cos(rad(start + sweep));
    const y2 = cy + r * Math.sin(rad(start + sweep));
    const dPath = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { dPath, color: SERIES[i % SERIES.length]!, label: d.label, value: d.value };
  });
  const summary = data.map((d) => `${d.label}: ${d.value}`).join("; ");
  return (
    <ChartFrame
      title={title}
      description={donut ? "Donut chart (synthetic)." : "Pie chart (synthetic)."}
    >
      <div className="fx-chart-pie">
        <svg
          viewBox="0 0 100 100"
          width={140}
          height={140}
          role="img"
          aria-label={`${title}. ${summary}`}
        >
          {slices.map((s) => (
            <path key={s.label} d={s.dPath} fill={s.color} />
          ))}
          {donut ? <circle cx="50" cy="50" r="22" fill="var(--fx-color-surface-default)" /> : null}
        </svg>
        <ul className="fx-chart-legend">
          {data.map((d, i) => (
            <li key={d.label}>
              <span
                className="fx-chart-swatch"
                style={{ background: SERIES[i % SERIES.length] }}
                aria-hidden
              />
              {d.label}: {d.value}
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

export function FxDonutChart(props: { title?: string; data: FxChartPoint[] }) {
  return <FxPieChart {...props} donut />;
}

export function FxKpiTrendCard({
  label,
  value,
  delta,
  series,
}: {
  label: string;
  value: string;
  delta: string;
  series: FxChartPoint[];
}) {
  const max = Math.max(...series.map((d) => d.value), 1);
  const w = 120;
  const h = 36;
  const pts = series
    .map((d, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * w;
      const y = h - (d.value / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <FxCard>
      <div className="fx-metric">
        <div className="fx-metric__label">{label}</div>
        <div className="fx-metric__value">{value}</div>
        <div className="fx-kpi-trend">
          <FxStatusBadge tone="success">{delta}</FxStatusBadge>
          <svg viewBox={`0 0 ${w} ${h}`} width={120} height={36} aria-hidden>
            <polyline
              fill="none"
              stroke="var(--fx-color-status-success)"
              strokeWidth="2"
              points={pts}
            />
          </svg>
        </div>
      </div>
    </FxCard>
  );
}

export type FxMapMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone?: "info" | "warning" | "danger" | "success";
};

function markerFill(tone: FxMapMarker["tone"]) {
  if (tone === "danger") return "var(--fx-color-status-danger)";
  if (tone === "warning") return "var(--fx-color-status-warning)";
  if (tone === "success") return "var(--fx-color-status-success)";
  return "var(--fx-color-status-info)";
}

function clusterMarkers(markers: FxMapMarker[], threshold = 40) {
  const clusters: Array<{ x: number; y: number; members: FxMapMarker[] }> = [];
  for (const m of markers) {
    const hit = clusters.find((c) => Math.hypot(c.x - m.x, c.y - m.y) < threshold);
    if (hit) {
      hit.members.push(m);
      hit.x = hit.members.reduce((s, n) => s + n.x, 0) / hit.members.length;
      hit.y = hit.members.reduce((s, n) => s + n.y, 0) / hit.members.length;
    } else {
      clusters.push({ x: m.x, y: m.y, members: [m] });
    }
  }
  return clusters;
}

/** Schematic reference map — not a production GIS client. */
export function FxMapPanel({
  title = "Map",
  markers,
  showDrawingTools = true,
  cluster = true,
}: {
  title?: string;
  markers: FxMapMarker[];
  showDrawingTools?: boolean;
  cluster?: boolean;
}) {
  const [layers, setLayers] = useState({ markers: true, grid: true, clusters: cluster });
  const clusters = clusterMarkers(markers);
  return (
    <FxCard title={title} actions={<FxStatusBadge tone="neutral">Reference map</FxStatusBadge>}>
      <div className="fx-map-panel">
        <div>
          <svg
            viewBox="0 0 400 240"
            width="100%"
            height={240}
            role="img"
            aria-label={`${title}. ${markers.length} markers. Schematic reference only.`}
            className="fx-map-canvas"
          >
            <path
              d="M20 180 C80 120, 140 200, 200 140 S320 80, 380 160"
              fill="none"
              stroke="var(--fx-color-border-default)"
              strokeWidth="8"
              opacity="0.5"
            />
            {layers.grid ? (
              <>
                <line x1="0" y1="80" x2="400" y2="80" stroke="var(--fx-color-border-subtle)" />
                <line x1="0" y1="160" x2="400" y2="160" stroke="var(--fx-color-border-subtle)" />
                <line x1="133" y1="0" x2="133" y2="240" stroke="var(--fx-color-border-subtle)" />
                <line x1="266" y1="0" x2="266" y2="240" stroke="var(--fx-color-border-subtle)" />
              </>
            ) : null}
            {layers.markers
              ? layers.clusters
                ? clusters.map((c, i) =>
                    c.members.length > 1 ? (
                      <g key={`c-${i}`}>
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r="14"
                          fill="var(--fx-color-action-primary)"
                          opacity="0.9"
                        >
                          <title>{`${c.members.length} markers clustered`}</title>
                        </circle>
                        <text
                          x={c.x}
                          y={c.y + 4}
                          textAnchor="middle"
                          fill="var(--fx-color-text-inverse)"
                          fontSize="11"
                          fontWeight="700"
                        >
                          {c.members.length}
                        </text>
                      </g>
                    ) : (
                      <g key={c.members[0]!.id}>
                        <circle cx={c.x} cy={c.y} r="8" fill={markerFill(c.members[0]!.tone)}>
                          <title>{c.members[0]!.label}</title>
                        </circle>
                      </g>
                    ),
                  )
                : markers.map((m) => (
                    <g key={m.id}>
                      <circle cx={m.x} cy={m.y} r="8" fill={markerFill(m.tone)}>
                        <title>{m.label}</title>
                      </circle>
                    </g>
                  ))
              : null}
          </svg>
          <div className="fx-field__hint fx-map-coords" aria-live="polite">
            Coordinates (demo): 35.2271° N, 80.8431° W
          </div>
        </div>
        <div className="fx-map-controls">
          <div>
            <strong className="fx-field__label">Layers</strong>
            <label className="fx-map-check">
              <input
                type="checkbox"
                checked={layers.markers}
                onChange={(e) => setLayers({ ...layers, markers: e.target.checked })}
              />
              Markers
            </label>
            <label className="fx-map-check">
              <input
                type="checkbox"
                checked={layers.grid}
                onChange={(e) => setLayers({ ...layers, grid: e.target.checked })}
              />
              Grid
            </label>
            <label className="fx-map-check">
              <input
                type="checkbox"
                checked={layers.clusters}
                onChange={(e) => setLayers({ ...layers, clusters: e.target.checked })}
              />
              Clustering
            </label>
          </div>
          <div>
            <strong className="fx-field__label">Legend</strong>
            <ul className="fx-chart-legend">
              <li>
                <span
                  className="fx-chart-swatch"
                  style={{ background: "var(--fx-color-status-info)" }}
                  aria-hidden
                />
                Info
              </li>
              <li>
                <span
                  className="fx-chart-swatch"
                  style={{ background: "var(--fx-color-status-warning)" }}
                  aria-hidden
                />
                Warning
              </li>
              <li>
                <span
                  className="fx-chart-swatch"
                  style={{ background: "var(--fx-color-status-danger)" }}
                  aria-hidden
                />
                Danger
              </li>
              <li>
                <span
                  className="fx-chart-swatch"
                  style={{ background: "var(--fx-color-action-primary)" }}
                  aria-hidden
                />
                Cluster
              </li>
            </ul>
          </div>
          {showDrawingTools ? (
            <div>
              <strong className="fx-field__label">Drawing (reference)</strong>
              <div className="fx-map-draw">
                <button type="button" className="fx-btn fx-btn--secondary" disabled>
                  Point
                </button>
                <button type="button" className="fx-btn fx-btn--secondary" disabled>
                  Line
                </button>
                <button type="button" className="fx-btn fx-btn--secondary" disabled>
                  Polygon
                </button>
              </div>
              <p className="fx-field__hint">Tools disabled in reference — no GIS backend.</p>
            </div>
          ) : null}
        </div>
      </div>
      <ul>
        {markers.map((m) => (
          <li key={m.id}>{m.label}</li>
        ))}
      </ul>
    </FxCard>
  );
}

export function FxWeatherCurrentCard({
  location = "Reference City",
  tempF = 72,
  condition = "Partly cloudy",
  wind = "8 mph NW",
}: {
  location?: string;
  tempF?: number;
  condition?: string;
  wind?: string;
}) {
  return (
    <FxCard title="Current conditions">
      <div className="fx-metric">
        <div className="fx-metric__label">{location}</div>
        <div className="fx-metric__value">{tempF}°F</div>
        <p className="fx-card__body">
          {condition} · Wind {wind}
        </p>
      </div>
    </FxCard>
  );
}

export function FxWeatherForecastCard({
  days = [
    { label: "Today", high: 74, low: 61 },
    { label: "Fri", high: 78, low: 63 },
    { label: "Sat", high: 80, low: 65 },
  ],
}: {
  days?: Array<{ label: string; high: number; low: number }>;
}) {
  return (
    <FxCard title="Forecast">
      <table className="fx-table">
        <caption className="fx-field__hint">3-day forecast (synthetic)</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">High</th>
            <th scope="col">Low</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.high}°</td>
              <td>{d.low}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FxCard>
  );
}

export function FxWeatherAlertBanner({
  title = "Weather advisory",
  children = "Synthetic heat advisory for demonstration. Not a live alert feed.",
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("fx-alert", "fx-alert--warning")} role="status">
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}
