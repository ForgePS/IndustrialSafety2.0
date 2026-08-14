"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";

type Overview = {
  model: string;
  generatedAt: string;
  facilityId: string | null;
  kpis: Record<string, number>;
  drilldowns: Array<{ key: string; count: number; href: string }>;
};

/**
 * Model A analytics workspace — counts from normalized industrial_* tables only.
 */
export function AnalyticsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const canView =
    Boolean(me?.isPlatformAdmin) ||
    (me?.permissions ?? []).includes("industrial.access") ||
    (me?.permissions ?? []).includes("industrial.admin");

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [facilityId, setFacilityId] = useState("");

  async function load(fid = facilityId) {
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<Overview>("/api/v1/industrial/analytics/overview", {
        query: { facilityId: fid || undefined },
      });
      setData(overview);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) {
    return (
      <section className="ind-unavailable" role="alert">
        <h1>{moduleName}</h1>
        <p>You do not have permission to view analytics.</p>
      </section>
    );
  }

  return (
    <div className="ind-content">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="mb-1">{moduleName}</h1>
          <p className="text-muted mb-0">
            Live Model A metrics from normalized Industrial tables. No generic ops records.
          </p>
        </div>
        <button type="button" className="btn btn-outline-primary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <FilterPanel
        title="Filters"
        searchId="analytics-facility"
        searchLabel="Facility ID"
        searchValue={facilityId}
        onSearchChange={setFacilityId}
        searchPlaceholder="All locations"
        onClearAll={() => {
          setFacilityId("");
          void load("");
        }}
        onSubmit={() => void load()}
      />

      {loading ? <p role="status">Loading analytics…</p> : null}
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
          <div>
            <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <p className="small text-muted">
            Source model: {data.model} · Updated {new Date(data.generatedAt).toLocaleString()}
          </p>
          <div className="row g-3">
            {data.drilldowns.map((d) => (
              <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={d.key}>
                <Link href={d.href} className="card h-100 text-decoration-none">
                  <div className="card-body">
                    <div className="text-muted text-uppercase small">{d.key}</div>
                    <div className="fs-3 fw-semibold text-body">{d.count}</div>
                    <div className="small text-primary">View records</div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!loading && !error && data && data.drilldowns.every((d) => d.count === 0) ? (
        <p className="text-muted mt-3">No records found for the selected filters.</p>
      ) : null}
    </div>
  );
}
