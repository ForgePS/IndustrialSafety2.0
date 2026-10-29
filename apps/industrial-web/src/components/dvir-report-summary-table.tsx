"use client";

import Link from "next/link";
import { apiGet } from "@forge/web-kit";
import { dotFileHref } from "@/lib/dot-compliance-module";
import {
  dvirDefectSummary,
  dvirDriverName,
  dvirInspectionDate,
  isDvirRecord,
  openPrintableHtmlPopup,
  tripTypeLabel,
} from "@/lib/dvir";
import { formatApiErrorMessage } from "@/lib/api-error";

export function DvirReportSummaryTable({
  rows,
  showTrip = false,
  canDelete = false,
  busy = false,
  onDelete,
  compact = false,
}: {
  rows: ReadonlyArray<Record<string, unknown>>;
  showTrip?: boolean;
  canDelete?: boolean;
  busy?: boolean;
  onDelete?: (row: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const dvirRows = rows.filter(isDvirRecord);
  if (dvirRows.length === 0) {
    return <p className="text-muted mb-0">No DVIR inspections on file.</p>;
  }

  async function printRow(row: Record<string, unknown>) {
    const id = String(row.id ?? "");
    if (!id) return;
    try {
      const data = await apiGet<{ html: string }>(
        `/api/v1/industrial/dot/${encodeURIComponent(id)}/printable`,
      );
      const blocked = openPrintableHtmlPopup(data.html, true);
      if (blocked) alert(blocked);
    } catch (e) {
      alert(formatApiErrorMessage(e, "Could not print DVIR"));
    }
  }

  return (
    <div className="table-responsive">
      <table className={`table ${compact ? "table-sm" : ""} mb-0`}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {showTrip ? <th scope="col">Trip</th> : null}
            <th scope="col">Defects</th>
            <th scope="col">Defect summary</th>
            <th scope="col">DRIVER</th>
            <th scope="col" className="text-end">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {dvirRows.map((row) => {
            const defects = dvirDefectSummary(row);
            const trip = String(row.tripType ?? "").toUpperCase();
            const id = String(row.id ?? "");
            return (
              <tr key={id}>
                <td>{dvirInspectionDate(row)}</td>
                {showTrip ? (
                  <td>
                    {trip === "POST_TRIP" || trip === "PRE_TRIP"
                      ? tripTypeLabel(trip as "PRE_TRIP" | "POST_TRIP")
                      : "—"}
                  </td>
                ) : null}
                <td>{defects.yesNo}</td>
                <td className={defects.hasDefects ? "text-danger" : "text-muted"}>
                  {defects.hasDefects ? defects.text : "—"}
                </td>
                <td>{dvirDriverName(row)}</td>
                <td className="text-end">
                  <div className="d-flex flex-wrap gap-1 justify-content-end">
                    {id ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void printRow(row)}
                      >
                        Print
                      </button>
                    ) : null}
                    {id ? (
                      <Link className="btn btn-sm btn-outline-secondary" href={dotFileHref(id)}>
                        View
                      </Link>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={busy}
                        onClick={() => onDelete?.(row)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
