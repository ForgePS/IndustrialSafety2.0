"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type ReportDefinition = { id: string; report_key: string; name: string; description?: string };

export function ReportingWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const [catalog, setCatalog] = useState<ReportDefinition[]>([]);
  const [result, setResult] = useState<{ name: string; rowCount: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!(me?.permissions ?? []).includes("reports.view")) return;
    setLoading(true);
    apiGet<ReportDefinition[]>("/api/v1/reports/catalog")
      .then(setCatalog)
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "Unable to load reports"))
      .finally(() => setLoading(false));
  }, [me]);

  async function run(reportKey: string) {
    try {
      setResult(await apiSend(`/api/v1/reports/${reportKey}/run`, "POST", {}));
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to run report");
    }
  }

  return (
    <section aria-labelledby="reporting-title">
      <ModuleWorkspaceHeader
        id="reporting-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Server-side report adapters never accept raw SQL."
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="alert alert-success" role="status">
          {result.name}: {result.rowCount} rows
        </div>
      ) : null}

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Report</th>
                <th>Description</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((report) => (
                <tr key={report.id}>
                  <td>{report.name}</td>
                  <td className="text-muted">{report.description ?? "—"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => void run(report.report_key)}
                    >
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
