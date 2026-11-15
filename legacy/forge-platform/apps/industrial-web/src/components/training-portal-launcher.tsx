"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TrainingPortalLauncher() {
  const router = useRouter();
  const [token, setToken] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    router.push(`/training/portal?token=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <div className="card shadow-sm">
        <div className="card-body p-4">
          <h1 className="h4 mb-2">Company training portal</h1>
          <p className="text-muted mb-4">
            Open your portal link below, or paste an access token from your QR code or admin invite.
          </p>
          <form onSubmit={onSubmit} className="d-flex flex-column gap-3">
            <div>
              <label htmlFor="training-portal-token" className="form-label">
                Access token
              </label>
              <input
                id="training-portal-token"
                className="form-control"
                placeholder="Paste token from your training link"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!token.trim()}>
              Open portal
            </button>
          </form>
          <hr className="my-4" />
          <p className="small text-muted mb-1">Local UAT (John Smith #10452)</p>
          <code className="small d-block">pnpm training:view</code>
        </div>
      </div>
    </div>
  );
}
