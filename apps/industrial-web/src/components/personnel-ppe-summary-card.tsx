"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import {
  EMPTY_PERSONNEL_PPE_SUMMARY,
  type PersonnelPpeSummary,
} from "@/lib/personnel-ppe";

function Stat({
  label,
  value,
  alert,
}: {
  label: string;
  value: number;
  alert?: "warning" | "danger";
}) {
  return (
    <div className="col-6 col-md-3">
      <small className="text-muted text-uppercase d-block">{label}</small>
      <span
        className={`fs-5 fw-semibold${
          alert === "danger" ? " text-danger" : alert === "warning" ? " text-warning" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Roster-level PPE allowance counts and 30-day expiration alerts. */
export function PersonnelPpeSummaryCard({ enabled }: { enabled: boolean }) {
  const [summary, setSummary] = useState<PersonnelPpeSummary>(EMPTY_PERSONNEL_PPE_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<PersonnelPpeSummary>("/api/v1/industrial/personnel/ppe-summary");
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load PPE summary");
          setSummary(EMPTY_PERSONNEL_PPE_SUMMARY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  const expiringTotal =
    summary.prescriptionGlassesExpiringSoon +
    summary.safetyFootwearExpiringSoon +
    summary.prescriptionGlassesExpired +
    summary.safetyFootwearExpired;

  return (
    <div className="card mb-4" aria-labelledby="personnel-ppe-summary-title">
      <div className="card-body py-3">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h6 className="mb-0" id="personnel-ppe-summary-title">
              PPE allowance tracking
            </h6>
            <small className="text-muted">
              Active roster counts. Alerts flag allowances expiring within{" "}
              {summary.expiringWithinDays} days.
            </small>
          </div>
          {expiringTotal > 0 ? (
            <span className="badge bg-warning text-dark">
              {expiringTotal} renewal{expiringTotal === 1 ? "" : "s"} due
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="text-danger small mb-0" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="text-muted small mb-0" role="status">
            Loading PPE summary…
          </p>
        ) : (
          <div className="row g-3">
            <Stat label="Prescription glasses" value={summary.prescriptionGlassesCount} />
            <Stat label="Safety footwear" value={summary.safetyFootwearCount} />
            <Stat
              label="Glasses expiring soon"
              value={summary.prescriptionGlassesExpiringSoon}
              {...(summary.prescriptionGlassesExpiringSoon > 0 ? { alert: "warning" as const } : {})}
            />
            <Stat
              label="Footwear expiring soon"
              value={summary.safetyFootwearExpiringSoon}
              {...(summary.safetyFootwearExpiringSoon > 0 ? { alert: "warning" as const } : {})}
            />
            <Stat
              label="Glasses expired"
              value={summary.prescriptionGlassesExpired}
              {...(summary.prescriptionGlassesExpired > 0 ? { alert: "danger" as const } : {})}
            />
            <Stat
              label="Footwear expired"
              value={summary.safetyFootwearExpired}
              {...(summary.safetyFootwearExpired > 0 ? { alert: "danger" as const } : {})}
            />
          </div>
        )}
      </div>
    </div>
  );
}
