"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import {
  fetchReportingSettings,
  runDueSchedules,
} from "@/lib/reporting-api";

type SettingsPayload = Awaited<ReturnType<typeof fetchReportingSettings>>;

export default function ReportingSettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [runningDue, setRunningDue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchReportingSettings());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRunDue() {
    setRunningDue(true);
    setMessage(null);
    try {
      const result = await runDueSchedules();
      const ok = result.results.filter((r) => r.status === "SUCCEEDED").length;
      const fail = result.results.filter((r) => r.status === "FAILED").length;
      setMessage(
        result.processed === 0
          ? "No due schedules to run."
          : `Processed ${result.processed}: ${ok} succeeded, ${fail} failed.`,
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to run due schedules");
    } finally {
      setRunningDue(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Admin</p>
        <h1 className="h4 mb-1">Reporting settings</h1>
        <p className="text-muted mb-0">
          Engine defaults, export limits, and schedule runner controls.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      ) : null}

      {loading || !settings ? (
        <div className="card border shadow-none">
          <div className="card-body text-muted">Loading settings…</div>
        </div>
      ) : (
        <>
          <div className="card border shadow-none mb-3">
            <div className="card-body">
              <h2 className="h6 mb-3">Export engine</h2>
              <dl className="row mb-0 small">
                <dt className="col-sm-4">Default format</dt>
                <dd className="col-sm-8 text-uppercase">{settings.defaultExportFormat}</dd>
                <dt className="col-sm-4">Supported formats</dt>
                <dd className="col-sm-8 text-uppercase">{settings.supportedFormats.join(", ")}</dd>
                <dt className="col-sm-4">Inline size cap</dt>
                <dd className="col-sm-8">
                  ~{Math.round(settings.inlineExportMaxChars / 1_000_000)} MB base64; larger
                  artifacts use {settings.largeExportStorage}
                </dd>
                <dt className="col-sm-4">Schedule timezone</dt>
                <dd className="col-sm-8">{settings.scheduleCronTimezoneDefault}</dd>
                <dt className="col-sm-4">Email delivery</dt>
                <dd className="col-sm-8">
                  Provider: <code>{settings.emailDelivery}</code>
                  {settings.emailDeliveryNotes ? (
                    <div className="text-muted mt-1">{settings.emailDeliveryNotes}</div>
                  ) : null}
                </dd>
              </dl>
            </div>
          </div>

          <div className="card border shadow-none mb-3">
            <div className="card-body">
              <h2 className="h6 mb-3">Your reporting permissions</h2>
              <ul className="list-unstyled mb-0 small">
                {Object.entries(settings.permissions).map(([key, allowed]) => (
                  <li key={key} className="mb-1">
                    <span className={allowed ? "text-success" : "text-muted"}>
                      {allowed ? "Allowed" : "Denied"}
                    </span>
                    {" — "}
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card border shadow-none">
            <div className="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <h2 className="h6 mb-1">Schedule runner</h2>
                <p className="text-muted small mb-0">
                  Run all due schedules for this tenant now. Also available from{" "}
                  <Link href="/reporting/scheduled/">Scheduled</Link>.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={runningDue || !settings.permissions.schedule}
                onClick={() => void onRunDue()}
              >
                {runningDue ? "Running…" : "Run due schedules"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
