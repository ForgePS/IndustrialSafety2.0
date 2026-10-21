"use client";

import { apiGet } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import {
  answerLabel,
  dvirDefectSummary,
  dvirDriverName,
  dvirInspectionDate,
  openPrintableHtmlPopup,
  resolveDvirReportItems,
  tripTypeLabel,
} from "@/lib/dvir";

type Props = {
  row: Record<string, unknown>;
  publicToken?: string;
  onBack?: () => void;
};

export function DvirReadonlyView({ row, publicToken, onBack }: Props) {
  const reportItems = resolveDvirReportItems(row);
  const noItems = reportItems.filter((item) => item.answer === "NO");
  const trip =
    String(row.tripType).toUpperCase() === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP";
  const defects = dvirDefectSummary(row);
  const recordId = String(row.id ?? "");

  async function printReport() {
    if (!recordId) return;
    try {
      const path = publicToken
        ? `/api/v1/public/dvir/${encodeURIComponent(publicToken)}/dvirs/${encodeURIComponent(recordId)}/printable`
        : `/api/v1/industrial/dot/${encodeURIComponent(recordId)}/printable`;
      const data = await apiGet<{ html: string }>(path);
      const blocked = openPrintableHtmlPopup(data.html, true);
      if (blocked) alert(blocked);
    } catch (e) {
      alert(formatApiErrorMessage(e, "Could not print DVIR"));
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h6 className="mb-0">{String(row.title ?? "DVIR")}</h6>
          <p className="text-muted small mb-0">
            {tripTypeLabel(trip)} · {dvirInspectionDate(row)}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => void printReport()}
          >
            Print
          </button>
          {onBack ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      </div>

      <dl className="row mb-3">
        <div className="col-md-4 mb-2">
          <dt className="text-muted small">Unit</dt>
          <dd className="mb-0">{String(row.truckNumber ?? "—")}</dd>
        </div>
        <div className="col-md-4 mb-2">
          <dt className="text-muted small">Trailers</dt>
          <dd className="mb-0">{String(row.trailerNumbers || "—")}</dd>
        </div>
        <div className="col-md-4 mb-2">
          <dt className="text-muted small">DRIVER</dt>
          <dd className="mb-0">{dvirDriverName(row)}</dd>
        </div>
        <div className="col-md-4 mb-2">
          <dt className="text-muted small">Defects</dt>
          <dd className="mb-0">{defects.yesNo}</dd>
        </div>
      </dl>

      <div className="table-responsive">
        <table className="table table-sm mb-0">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Answer</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {reportItems.map((item) => (
              <tr key={item.id} className={item.answer === "NO" ? "table-danger" : undefined}>
                <td>{item.label}</td>
                <td>{answerLabel(item.answer)}</td>
                <td>{item.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {noItems.length > 0 ? (
        <div className="mt-3">
          <h6 className="mb-2">Defects (No)</h6>
          <ul className="mb-0 small">
            {noItems.map((item) => (
              <li key={item.id}>
                {item.label}
                {item.notes ? ` — ${item.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {row.remarks ? (
        <div className="mt-3">
          <h6 className="mb-1">Remarks</h6>
          <p className="mb-0 small">{String(row.remarks)}</p>
        </div>
      ) : null}

      <p className="text-muted small mt-3 mb-0">
        Submitted DVIRs cannot be edited. Use Print for a paper copy.
      </p>
    </div>
  );
}
