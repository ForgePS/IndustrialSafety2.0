"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  buildEmergencyAlertSmsBody,
  estimateSmsSegments,
} from "@/lib/emergency-alerts";

export type MessagePreviewInput = {
  alertType: string;
  severity: string;
  headline: string;
  shortMessage: string;
  instructions?: string;
  channels: string[];
  /** When omitted, preview offers a drill toggle. */
  isDrill?: boolean;
};

type PreviewChannel = "SMS" | "IN_APP" | "MVIX";

const CHANNEL_TABS: Array<{ id: PreviewChannel; label: string }> = [
  { id: "SMS", label: "SMS" },
  { id: "IN_APP", label: "Forge App" },
  { id: "MVIX", label: "Mvix" },
];

function severityTone(severity: string): string {
  switch (severity.toUpperCase()) {
    case "EXTREME":
      return "#7f1d1d";
    case "SEVERE":
      return "#b91c1c";
    case "MODERATE":
      return "#c2410c";
    default:
      return "#a16207";
  }
}

const phoneShell: CSSProperties = {
  maxWidth: 280,
  margin: "0 auto",
  border: "2px solid #334155",
  borderRadius: "1.5rem",
  background: "#0f172a",
  padding: "0.5rem 0.65rem 1rem",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)",
};

const phoneNotch: CSSProperties = {
  width: "36%",
  height: "0.35rem",
  margin: "0.25rem auto 0.75rem",
  borderRadius: 999,
  background: "#475569",
};

const phoneScreen: CSSProperties = {
  background: "#f8fafc",
  borderRadius: "0.75rem",
  minHeight: 140,
  padding: "0.75rem",
  color: "#0f172a",
};

const bubble: CSSProperties = {
  display: "inline-block",
  maxWidth: "100%",
  background: "#e2e8f0",
  borderRadius: "1rem 1rem 1rem 0.25rem",
  padding: "0.65rem 0.85rem",
  fontSize: "0.9rem",
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export function EmergencyAlertMessagePreview({
  alertType,
  severity,
  headline,
  shortMessage,
  instructions = "",
  channels,
  isDrill: isDrillProp,
}: MessagePreviewInput) {
  const [drillOverride, setDrillOverride] = useState(false);
  const [active, setActive] = useState<PreviewChannel>("SMS");

  const isDrill = isDrillProp ?? drillOverride;
  const selected = useMemo(() => {
    const set = new Set(channels.map((c) => c.toUpperCase()));
    const tabs = CHANNEL_TABS.filter((t) => set.has(t.id));
    return tabs.length ? tabs : CHANNEL_TABS;
  }, [channels]);

  const activeTab = selected.some((t) => t.id === active) ? active : selected[0]!.id;

  const smsBody = buildEmergencyAlertSmsBody({ shortMessage, isDrill });
  const smsMeta = estimateSmsSegments(smsBody);
  const empty = !headline.trim() && !shortMessage.trim();
  const tone = severityTone(severity);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div className="fw-semibold small text-uppercase text-muted mb-0">Message preview</div>
        {isDrillProp === undefined ? (
          <label className="form-check form-check-inline mb-0 small">
            <input
              type="checkbox"
              className="form-check-input"
              checked={drillOverride}
              onChange={(e) => setDrillOverride(e.target.checked)}
            />
            <span className="form-check-label">Preview as drill</span>
          </label>
        ) : isDrill ? (
          <span className="badge text-bg-warning">Drill</span>
        ) : null}
      </div>

      <ul className="nav nav-pills nav-fill gap-1 mb-3" role="tablist">
        {selected.map((tab) => (
          <li className="nav-item" key={tab.id} role="presentation">
            <button
              type="button"
              className={`nav-link py-1 px-2 small ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {empty ? (
        <p className="text-muted small mb-0">Enter a headline and short message to preview.</p>
      ) : activeTab === "SMS" ? (
        <div>
          <div style={phoneShell} aria-label="SMS preview">
            <div style={phoneNotch} />
            <div style={phoneScreen}>
              <div className="text-muted mb-2" style={{ fontSize: "0.7rem" }}>
                Forge Alerts · now
              </div>
              <div style={bubble}>{smsBody || "—"}</div>
            </div>
          </div>
          <p className="small text-muted mb-0 mt-2">
            {smsMeta.length} characters · ~{smsMeta.segments} SMS segment
            {smsMeta.segments === 1 ? "" : "s"} ({smsMeta.perSegment}/segment). Carriers receive
            the short message
            {isDrill ? " with a [DRILL] prefix" : ""}; headline is not included in SMS.
          </p>
        </div>
      ) : activeTab === "IN_APP" ? (
        <div
          className="border rounded-3 overflow-hidden"
          style={{ borderLeftWidth: 4, borderLeftColor: tone, borderLeftStyle: "solid" }}
        >
          <div
            className="px-3 py-2 text-white small fw-semibold d-flex justify-content-between gap-2"
            style={{ background: tone }}
          >
            <span>
              {isDrill ? "DRILL · " : ""}
              {alertType.replace(/_/g, " ")}
            </span>
            <span>{severity}</span>
          </div>
          <div className="p-3 bg-body">
            <div className="fw-semibold mb-1">{headline.trim() || "Untitled alert"}</div>
            <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
              {shortMessage.trim() || "—"}
            </p>
            {instructions.trim() ? (
              <div className="small">
                <div className="text-muted text-uppercase fw-semibold mb-1">Instructions</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{instructions.trim()}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="rounded-3 text-white p-4"
          style={{
            background: `linear-gradient(145deg, ${tone} 0%, #111827 70%)`,
            minHeight: 180,
          }}
        >
          <div className="text-uppercase small mb-2" style={{ opacity: 0.75 }}>
            {isDrill ? "Drill · " : "Emergency · "}
            {alertType.replace(/_/g, " ")} · {severity}
          </div>
          <div className="fw-bold lh-sm mb-3" style={{ fontSize: "1.75rem" }}>
            {headline.trim() || "Untitled alert"}
          </div>
          <p className="mb-0" style={{ whiteSpace: "pre-wrap", fontSize: "1.15rem", opacity: 0.95 }}>
            {shortMessage.trim() || "—"}
          </p>
          {instructions.trim() ? (
            <p className="mt-3 mb-0 small" style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>
              {instructions.trim()}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
