"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

function resolveStatusToken(input: {
  pathname?: string | null;
  routeToken?: string | null;
}): string {
  const path = String(input.pathname ?? "");
  const pathMatch = path.match(/\/safety-supplies\/request\/status\/([^/]+)/i);
  const fromPathname = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : "";
  if (fromPathname && fromPathname !== "placeholder") return fromPathname;

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;
  return "";
}

export function SafetySupplyRequestStatusClient() {
  const params = useParams();
  const pathname = usePathname();
  const statusToken = resolveStatusToken({
    pathname,
    routeToken: typeof params?.statusToken === "string" ? params.statusToken : null,
  });
  const [data, setData] = useState<{
    requestNumber: string;
    status: string;
    priority?: string;
    employeeMessage?: string | null;
    items: Array<{ name: string; quantityRequested: string; status: string }>;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!statusToken) {
      setError("Request not found");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `${apiBase()}/api/v1/public/safety-supplies/request-status/${encodeURIComponent(statusToken)}`,
        );
        const json = (await res.json()) as {
          data?: typeof data;
          error?: { message?: string };
        };
        if (!res.ok) throw new Error(json.error?.message || "Request not found");
        setData(json.data ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request not found");
      }
    })();
  }, [statusToken]);

  return (
    <main className="container py-4" style={{ maxWidth: 560 }}>
      <h1 className="h3 mb-3">Request Status</h1>
      {error ? <p>{error}</p> : null}
      {data ? (
        <>
          <p>
            <strong>{data.requestNumber}</strong>
          </p>
          <p>Status: {data.status.replace(/_/g, " ")}</p>
          {data.employeeMessage ? <p className="alert alert-info">{data.employeeMessage}</p> : null}
          <ul className="list-group">
            {data.items.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="list-group-item">
                {item.name} × {item.quantityRequested}
                <div className="small text-muted">{item.status}</div>
              </li>
            ))}
          </ul>
        </>
      ) : !error ? (
        <p className="text-muted">Loading…</p>
      ) : null}
    </main>
  );
}
