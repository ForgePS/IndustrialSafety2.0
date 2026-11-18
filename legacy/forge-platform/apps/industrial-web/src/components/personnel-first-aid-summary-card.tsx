"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import {
  EMPTY_PERSONNEL_FIRST_AID_SUMMARY,
  type PersonnelFirstAidSummary,
} from "@/lib/personnel-first-aid";

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

/** Roster-level First Aid / CPR counts and 30-day expiration notifications. */
export function PersonnelFirstAidSummaryCard({
  enabled,
  refreshKey = 0,
}: {
  enabled: boolean;
  refreshKey?: number;
}) {
  const [summary, setSummary] = useState<PersonnelFirstAidSummary>(
    EMPTY_PERSONNEL_FIRST_AID_SUMMARY,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<PersonnelFirstAidSummary>(
          "/api/v1/industrial/personnel/first-aid-summary",
        );
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load First Aid summary");
          setSummary(EMPTY_PERSONNEL_FIRST_AID_SUMMARY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  if (!enabled) return null;

  const expiringTotal =
    summary.cprExpiringSoon +
    summary.firstAidExpiringSoon +
    summary.cprExpired +
    summary.firstAidExpired;

  return (
    <div className="card mb-4" aria-labelledby="personnel-first-aid-summary-title">
      <div className="card-body py-3">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h6 className="mb-0" id="personnel-first-aid-summary-title">
              First Aid &amp; CPR tracking
            </h6>
            <small className="text-muted">
              Sorted by location. Notifications flag certifications expiring within{" "}
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
            Loading First Aid summary…
          </p>
        ) : (
          <div className="row g-3">
            <Stat label="People tracked" value={summary.trackedCount} />
            <Stat
              label="CPR expiring soon"
              value={summary.cprExpiringSoon}
              {...(summary.cprExpiringSoon > 0 ? { alert: "warning" as const } : {})}
            />
            <Stat
              label="First Aid expiring soon"
              value={summary.firstAidExpiringSoon}
              {...(summary.firstAidExpiringSoon > 0 ? { alert: "warning" as const } : {})}
            />
            <Stat
              label="CPR expired"
              value={summary.cprExpired}
              {...(summary.cprExpired > 0 ? { alert: "danger" as const } : {})}
            />
            <Stat
              label="First Aid expired"
              value={summary.firstAidExpired}
              {...(summary.firstAidExpired > 0 ? { alert: "danger" as const } : {})}
            />
          </div>
        )}
      </div>
    </div>
  );
}
