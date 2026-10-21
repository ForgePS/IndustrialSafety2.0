"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";

type ResolvePayload = {
  kind: string;
  device?: {
    id: string;
    deviceNumber?: string | null;
    deviceType?: string | null;
    building?: string | null;
    area?: string | null;
    status?: string | null;
  };
  recentFindings?: Array<{ id: string; pestCategory?: string | null; observedAt?: string | null }>;
  actions?: Array<{ id: string; label: string; href: string }>;
};

export function SanitationPestDeviceScanClient() {
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
          `/api/v1/industrial/sanitation/resolve-qr/pest-device/${encodeURIComponent(token)}`,
        );
        setData(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to resolve pest device QR");
      }
    })();
  }, [token, me?.tenantId]);

  return (
    <>
      <h1 className="ff-page-title">
        {data?.device?.deviceNumber || data?.device?.deviceType || "Pest Device"}
      </h1>
      {error ? <p className="ff-error">{error}</p> : null}
      {data ? (
        <>
          <p className="ff-page-body">
            {[data.device?.deviceType, data.device?.status, data.device?.building, data.device?.area]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(data.recentFindings ?? []).length > 0 ? (
            <div className="ff-stack">
              <strong>Recent findings</strong>
              {data.recentFindings?.slice(0, 5).map((f) => (
                <p key={f.id} className="ff-hint ff-hint--left">
                  {f.pestCategory || "Finding"}
                  {f.observedAt ? ` · ${new Date(f.observedAt).toLocaleString()}` : ""}
                </p>
              ))}
            </div>
          ) : (
            <p className="ff-hint ff-hint--left">No recent pest findings on this device.</p>
          )}
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
        <p className="ff-hint">Loading pest device…</p>
      ) : null}
    </>
  );
}
