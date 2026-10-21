"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@forge/web-kit";
import { dotFileHref } from "@/lib/dot-compliance-module";
import {
  dvirDayStatus,
  dvirDayStatusLabel,
  dvirDefectSummary,
  dvirDriverName,
  dvirRetentionDateRange,
  DVIR_RETENTION_DAYS,
  groupDvirsByDate,
  isDvirRecord,
  openPrintableHtmlPopup,
  tripTypeLabel,
} from "@/lib/dvir";
import { formatApiErrorMessage } from "@/lib/api-error";

type Props = {
  rows: ReadonlyArray<Record<string, unknown>>;
  vehicleId?: string;
  publicToken?: string;
  onViewReport?: (row: Record<string, unknown>) => void;
};

function statusClass(status: ReturnType<typeof dvirDayStatus>): string {
  switch (status) {
    case "complete":
      return "dvir-day-cal__cell--complete";
    case "partial":
      return "dvir-day-cal__cell--partial";
    case "defects":
      return "dvir-day-cal__cell--defects";
    default:
      return "dvir-day-cal__cell--empty";
  }
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DvirDayCalendar({
  vehicleId,
  publicToken,
  rows,
  onViewReport,
}: Props) {
  const dvirRows = useMemo(() => rows.filter(isDvirRecord), [rows]);
  const byDate = useMemo(() => groupDvirsByDate(dvirRows), [dvirRows]);
  const dates = useMemo(() => dvirRetentionDateRange(), []);
  const today = dates[dates.length - 1] ?? "";
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const selectedBucket = byDate.get(selectedDate);
  const selectedStatus = dvirDayStatus(selectedBucket);

  async function printDay(date: string) {
    setPrinting(true);
    setPrintError(null);
    try {
      const path = publicToken
        ? `/api/v1/public/dvir/${encodeURIComponent(publicToken)}/dvirs/day/${encodeURIComponent(date)}/printable`
        : `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId ?? "")}/dvirs/day/${encodeURIComponent(date)}/printable`;
      const data = await apiGet<{ html: string }>(path);
      const blocked = openPrintableHtmlPopup(data.html, true);
      if (blocked) setPrintError(blocked);
    } catch (e) {
      setPrintError(formatApiErrorMessage(e, "Could not open printable DVIR"));
    } finally {
      setPrinting(false);
    }
  }

  function viewReport(row: Record<string, unknown>) {
    if (onViewReport) {
      onViewReport(row);
      return;
    }
  }

  return (
    <div className="dvir-day-cal mb-4">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h6 className="mb-1">Inspection calendar</h6>
          <p className="text-muted small mb-0">
            Last {DVIR_RETENTION_DAYS} calendar days on file. Older records are removed automatically.
            Click a day to review or print.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={printing || selectedStatus === "empty"}
          onClick={() => void printDay(selectedDate)}
        >
          {printing ? "Preparing…" : "Print selected day"}
        </button>
      </div>

      {printError ? (
        <div className="alert alert-warning py-2 small" role="alert">
          {printError}
        </div>
      ) : null}

      <div className="dvir-day-cal__grid" aria-label="DVIR calendar">
        {dates.map((date) => {
          const status = dvirDayStatus(byDate.get(date));
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              className={`dvir-day-cal__cell ${statusClass(status)}${isSelected ? " is-selected" : ""}`}
              aria-pressed={isSelected}
              aria-label={`${formatDayLabel(date)} — ${dvirDayStatusLabel(status)}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="dvir-day-cal__date">{formatDayLabel(date)}</span>
              {isToday ? <span className="dvir-day-cal__today">Today</span> : null}
            </button>
          );
        })}
      </div>

      <div className="card border shadow-none mt-3">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
              <h6 className="mb-0">{selectedDate}</h6>
              <small className="text-muted">{dvirDayStatusLabel(selectedStatus)}</small>
            </div>
            {selectedStatus !== "empty" ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={printing}
                onClick={() => void printDay(selectedDate)}
              >
                Print day
              </button>
            ) : null}
          </div>

          {selectedStatus === "empty" ? (
            <p className="text-muted mb-0">No DVIR was recorded on this date.</p>
          ) : (
            <div className="row g-3">
              {(["preTrip", "postTrip"] as const).map((slot) => {
                const row = selectedBucket?.[slot];
                const label = slot === "preTrip" ? "Pre-trip" : "Post-trip";
                return (
                  <div className="col-md-6" key={slot}>
                    <div className="border rounded p-3 h-100">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <strong>{label}</strong>
                        {row ? (
                          <span className="badge bg-label-secondary">
                            {tripTypeLabel(
                              String(row.tripType).toUpperCase() === "POST_TRIP"
                                ? "POST_TRIP"
                                : "PRE_TRIP",
                            )}
                          </span>
                        ) : null}
                      </div>
                      {row ? (
                        <>
                          <p className="small mb-2">
                            DRIVER: {dvirDriverName(row)}
                            <br />
                            Defects: {dvirDefectSummary(row).yesNo}
                          </p>
                          {onViewReport || publicToken ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => viewReport(row)}
                            >
                              View report
                            </button>
                          ) : (
                            <Link
                              className="btn btn-sm btn-outline-primary"
                              href={dotFileHref(String(row.id))}
                            >
                              View report
                            </Link>
                          )}
                        </>
                      ) : (
                        <p className="text-muted small mb-0">Not submitted</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
