"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";

type ResolvePayload = {
  kind: string;
  sanitationStatus?: string;
  openFindingCount?: number;
  location?: { id: string; name?: string; building?: string | null; area?: string | null };
  lastInspection?: { completedAt?: string | null; title?: string | null } | null;
  lastCleaning?: { completedAt?: string | null; title?: string | null } | null;
  actions?: Array<{ id: string; label: string; href: string }>;
};

export function SanitationLocationScanClient() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const token = String(params?.token ?? "");
  const [data, setData] = useState<ResolvePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !me?.tenantId) return;
    void (async () => {
      try {
        const res = await apiGet<ResolvePayload>(
          `/api/v1/industrial/sanitation/resolve-qr/location/${encodeURIComponent(token)}`,
        );
        setData(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to resolve sanitation QR");
      }
    })();
  }, [token, me?.tenantId]);

  return (
    <>
      <h1 className="ff-page-title">{data?.location?.name || "Sanitation Location"}</h1>
      {error ? <p className="ff-error">{error}</p> : null}
      {data ? (
        <>
          <p className="ff-page-body">
            Status: <strong>{data.sanitationStatus ?? "—"}</strong>
            {data.openFindingCount ? ` · ${data.openFindingCount} open findings` : ""}
          </p>
          <p className="ff-hint ff-hint--left">
            {[data.location?.building, data.location?.area].filter(Boolean).join(" · ") ||
              "Location profile"}
          </p>
          <p className="ff-hint ff-hint--left">
            Last inspection:{" "}
            {data.lastInspection?.completedAt
              ? new Date(data.lastInspection.completedAt).toLocaleString()
              : "—"}
          </p>
          <p className="ff-hint ff-hint--left">
            Last cleaning:{" "}
            {data.lastCleaning?.completedAt
              ? new Date(data.lastCleaning.completedAt).toLocaleString()
              : "—"}
          </p>
          <div className="ff-action-grid">
            {(data.actions ?? []).map((action) => (
              <button
                key={action.id}
                type="button"
                className="ff-action-tile"
                onClick={() => router.push(action.href)}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              className="ff-btn ff-btn-secondary ff-action-grid-span"
              onClick={() => router.push("/sanitation/")}
            >
              Sanitation home
            </button>
          </div>
        </>
      ) : !error ? (
        <p className="ff-hint">Loading location…</p>
      ) : null}
    </>
  );
}
