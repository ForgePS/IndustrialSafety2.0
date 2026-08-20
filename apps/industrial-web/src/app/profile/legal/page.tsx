"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";

type AckRow = {
  id: string;
  title: string;
  documentKey: string;
  documentVersion: string;
  documentHash: string;
  documentId: string;
  documentVersionId: string;
  acceptedAt: string;
  status: string;
  effectiveAt: string;
  documentType: string;
};

type Requirements = {
  status: string;
  pendingCount: number;
  pending?: Array<{
    documentId: string;
    documentVersionId: string;
    documentTitle: string;
    version: string;
  }>;
};

export default function ProfileLegalPage() {
  const [items, setItems] = useState<AckRow[]>([]);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [mine, current] = await Promise.all([
          apiGet<{ items: AckRow[] }>("/api/v1/legal/acknowledgments/me"),
          apiGet<Requirements>("/api/v1/legal/requirements/current"),
        ]);
        if (cancelled) return;
        setItems(mine.items ?? []);
        setRequirements(current);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load legal history");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ind-content">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Legal &amp; Acknowledgments</h1>
          <p className="text-muted mb-0">
            Terms of Use, Privacy Notice, Acceptable Use Policy, Accessibility Notice, and your
            electronic acknowledgment history.
          </p>
        </div>
        <Link href="/profile/" className="btn btn-sm btn-outline-secondary">
          Back to profile
        </Link>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {requirements && requirements.pendingCount > 0 ? (
        <div className="alert alert-warning">
          Action required: {requirements.pendingCount} document(s) need acknowledgment.{" "}
          <Link href="/legal/acknowledge/">Review and acknowledge</Link>
        </div>
      ) : (
        <div className="alert alert-success">Acknowledgment status: Current</div>
      )}

      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Document</th>
              <th>Version</th>
              <th>Effective</th>
              <th>Acknowledged</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.title || row.documentKey}</td>
                <td>{row.documentVersion}</td>
                <td>{row.effectiveAt ? new Date(row.effectiveAt).toLocaleDateString() : "—"}</td>
                <td>{row.acceptedAt ? new Date(row.acceptedAt).toLocaleString() : "—"}</td>
                <td>{row.status === "ACKNOWLEDGED" ? "CURRENT" : row.status}</td>
                <td>
                  <Link
                    href={`/legal/acknowledge/`}
                    className="btn btn-sm btn-outline-primary"
                    title="Open acknowledgment workspace"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  No acknowledgment history yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
