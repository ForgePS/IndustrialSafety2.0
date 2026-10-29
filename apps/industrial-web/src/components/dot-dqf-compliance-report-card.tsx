"use client";

import { useMemo } from "react";
import { FleetPrintHeader } from "@/components/fleet-print-header";
import { printFleetReport } from "@/lib/fleet-print";
import {
  buildDqfComplianceCsv,
  buildDqfComplianceReport,
  downloadDqfComplianceCsv,
  dqfRowIssueSummary,
  formatDqfComplianceStats,
} from "@/lib/dot-dqf-compliance-report";
import { personNameDisplay } from "@/lib/person-name-display";

export function DotDqfComplianceReportCard({
  records,
  tenantSlug,
}: {
  records: Array<Record<string, unknown>>;
  tenantSlug?: string | null;
}) {
  const report = useMemo(
    () => buildDqfComplianceReport(records, tenantSlug === undefined ? undefined : { tenantSlug }),
    [records, tenantSlug],
  );

  function exportExcel() {
    downloadDqfComplianceCsv(
      `dqf-compliance-${new Date().toISOString().slice(0, 10)}.csv`,
      buildDqfComplianceCsv(report),
    );
  }

  return (
    <div className="dot-dqf-compliance-report">
      <div className="card border shadow-none">
        <div className="card-body p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div className="min-w-0">
              <h4 className="mb-1" id="dqf-compliance-report-title">
                DQF Compliance Report
              </h4>
              <p className="text-muted mb-2">
                Full roster summary of DQF document items — missing, expired, expiring, and
                copy-on-file status.
              </p>
              <p className="text-muted small mb-0">{formatDqfComplianceStats(report)}</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={report.rows.length === 0}
                onClick={() => printFleetReport()}
              >
                Export PDF
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={report.rows.length === 0}
                onClick={() => exportExcel()}
              >
                Export Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="dot-dqf-compliance-report__print-only card" aria-hidden="true">
        <div className="card-body">
          <FleetPrintHeader
            title="DQF Compliance Report"
            subtitle={`${formatDqfComplianceStats(report)} · Printed ${new Date().toLocaleString()}`}
          />
          {report.rows.length === 0 ? (
            <p>No DQF driver files.</p>
          ) : (
            <table className="table table-sm table-bordered mb-0">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Employee #</th>
                  <th>Severity</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.recordId}>
                    <td>{personNameDisplay(row.driverName)}</td>
                    <td>{row.employeeNumber || "—"}</td>
                    <td>{row.severity}</td>
                    <td>{dqfRowIssueSummary(row) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
