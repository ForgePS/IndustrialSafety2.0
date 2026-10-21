"use client";

import Link from "next/link";
import { IncidentAttachmentsPanel } from "@/components/incident-attachments-panel";
import {
  bodyLocationSummaryLabel,
} from "@/lib/incident-body-map";
import { useBodyRegions } from "@/hooks/use-body-regions";
import type { IncidentAttachment } from "@/lib/incident-attachments";
import {
  MEDICAL_REFUSAL_EMERGENCY_NOTICE,
  formatMedicalRefusalDetailLines,
} from "@/lib/medical-refusal-acknowledgment";
import { formatReasonableSuspicionDetailLines } from "@/lib/reasonable-suspicion";
import {
  incidentNeedsOccurrenceDate,
  incidentReportDetailRows,
  statusBadgeClass,
  type IncidentRecord,
} from "@/lib/incidents-module";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";

type Props = {
  incident: IncidentRecord;
  onClose: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  canManageWc?: boolean;
  onOpenWorkersComp?: () => void;
  openingWc?: boolean;
  canManageOsha?: boolean;
  onOpenOsha?: () => void;
  openingOsha?: boolean;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  printing?: boolean;
  onPrintOsha301?: () => void;
  printingOsha301?: boolean;
  onAttachmentsChange?: (attachments: IncidentAttachment[]) => void;
};

/** Full incident report view opened from the list or a deep link. */
export function IncidentReportPanel({
  incident,
  onClose,
  canManage = false,
  onEdit,
  canDelete = false,
  onDelete,
  deleting = false,
  canManageWc = false,
  onOpenWorkersComp,
  openingWc = false,
  canManageOsha = false,
  onOpenOsha,
  openingOsha = false,
  onPrint,
  onDownloadPdf,
  printing = false,
  onPrintOsha301,
  printingOsha301 = false,
  onAttachmentsChange,
}: Props) {
  const { regions } = useBodyRegions();
  const details = incidentReportDetailRows(incident);
  const bodySummary = bodyLocationSummaryLabel(incident.bodyLocations, regions);
  const description = incident.description.trim();
  const corrective = incident.workDayDetails.trim();
  const showCorrective = corrective.length > 0 && corrective !== description;
  const busy = deleting || printing || printingOsha301 || openingWc || openingOsha;
  const hasWcCase = Boolean(incident.workersCompCaseId.trim());
  const wcLabel = hasWcCase ? "View WC case" : "Open WC case";
  const hasOshaCase = Boolean(incident.oshaCaseId.trim());
  const oshaLabel = hasOshaCase ? "View OSHA case" : "Enter OSHA information";
  const refusal = incident.medicalRefusalAcknowledgment;
  const refusalRows = refusal ? formatMedicalRefusalDetailLines(refusal) : [];
  const suspicion = incident.reasonableSuspicion;
  const suspicionRows = suspicion ? formatReasonableSuspicionDetailLines(suspicion) : [];

  return (
    <div className="card border-primary mb-4 incidents-report" id={`incident-report-${incident.id}`}>
      <div className="card-header d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
            <h5 className="card-title mb-0">{incident.title}</h5>
            <span className={`badge ${statusBadgeClass(incident.status)}`}>{incident.status}</span>
            {incident.severity ? (
              <span className="badge bg-label-secondary">{incident.severity}</span>
            ) : null}
          </div>
          <small className="text-muted">
            {incident.incidentTypeName || incident.category || "Incident report"}
          </small>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {onPrint ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={onPrint}
            >
              <i className="bx bx-printer me-1" />
              {printing ? "Preparing…" : "Print"}
            </button>
          ) : null}
          {onPrintOsha301 ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={onPrintOsha301}
              title="Print the official OSHA Form 301 seeded from this incident"
            >
              <i className="bx bx-file me-1" />
              {printingOsha301 ? "Preparing 301…" : "Print OSHA 301"}
            </button>
          ) : null}
          {onDownloadPdf ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={onDownloadPdf}
              title="Download a printable report you can Save as PDF"
            >
              <i className="bx bx-download me-1" />
              Download PDF
            </button>
          ) : null}
          {canManage && onEdit ? (
            <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={onEdit}>
              Edit report
            </button>
          ) : null}
          {canManageWc && onOpenWorkersComp ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={busy}
              onClick={onOpenWorkersComp}
            >
              {openingWc ? "Opening…" : wcLabel}
            </button>
          ) : null}
          {canManageOsha && onOpenOsha ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={busy}
              onClick={onOpenOsha}
              title="Enter OSHA Form 300/301 details even if this incident is not workers' compensation eligible"
            >
              {openingOsha ? "Opening…" : oshaLabel}
            </button>
          ) : null}
          {canDelete && onDelete ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              disabled={busy}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
      <div className="card-body">
        {incidentNeedsOccurrenceDate(incident) ? (
          <div className="alert alert-warning py-2 small" role="status">
            This incident needs an occurrence date. Edit the report and set{" "}
            <strong>Date occurred</strong> so it sorts and groups correctly.
          </div>
        ) : null}
        {details.length > 0 ? (
          <dl className="row incidents-report__details mb-0">
            {details.map((row) => (
              <div className="col-sm-6 col-lg-4 mb-3" key={row.label}>
                <dt className="text-muted small text-uppercase fw-normal mb-1">{row.label}</dt>
                <dd className="mb-0">
                  {row.label === "Person affected" && incident.personnelId ? (
                    <Link href={personFileHref(incident.personnelId)} target="_blank" rel="noreferrer">
                      {personNameDisplay(row.value, "Open profile")}
                    </Link>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
            {bodySummary ? (
              <div className="col-sm-6 col-lg-4 mb-3">
                <dt className="text-muted small text-uppercase fw-normal mb-1">Body map</dt>
                <dd className="mb-0">{bodySummary}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {description ? (
          <div className="incidents-report__narrative mt-2 pt-3 border-top">
            <h6 className="text-muted text-uppercase small mb-2">Description</h6>
            <p className="mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>
              {description}
            </p>
          </div>
        ) : null}

        {showCorrective ? (
          <div className="incidents-report__narrative mt-2 pt-3 border-top">
            <h6 className="text-muted text-uppercase small mb-2">Immediate corrective action(s)</h6>
            <p className="mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>
              {corrective}
            </p>
          </div>
        ) : null}

        {!description && !showCorrective ? (
          <p className="text-muted mb-0 mt-2">No description was recorded on this report.</p>
        ) : null}

        {suspicion && suspicionRows.length > 0 ? (
          <div className="incidents-report__narrative mt-3 pt-3 border-top">
            <h6 className="text-muted text-uppercase small mb-2">Reasonable Suspicion Observation</h6>
            <dl className="row mb-0">
              {suspicionRows.map((row) => (
                <div className="col-12 mb-2" key={row.label}>
                  <dt className="text-muted small text-uppercase fw-normal mb-1">{row.label}</dt>
                  <dd className="mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {suspicion.observerSignature || suspicion.secondObserverSignature ? (
              <div className="row g-3 mt-1">
                {suspicion.observerSignature ? (
                  <div className="col-md-6">
                    <div className="small text-muted mb-1">Supervisor signature</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={suspicion.observerSignature}
                      alt="Supervisor signature"
                      className="img-fluid border rounded bg-white"
                      style={{ maxHeight: 100 }}
                    />
                  </div>
                ) : null}
                {suspicion.secondObserverSignature ? (
                  <div className="col-md-6">
                    <div className="small text-muted mb-1">Second observer signature</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={suspicion.secondObserverSignature}
                      alt="Second observer signature"
                      className="img-fluid border rounded bg-white"
                      style={{ maxHeight: 100 }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {refusal && refusalRows.length > 0 ? (
          <div className="incidents-report__narrative mt-3 pt-3 border-top">
            <h6 className="text-muted text-uppercase small mb-2">
              Medical Evaluation / Treatment Refusal Acknowledgment
            </h6>
            <dl className="row mb-0">
              {refusalRows.map((row) => (
                <div className="col-12 mb-2" key={row.label}>
                  <dt className="text-muted small text-uppercase fw-normal mb-1">{row.label}</dt>
                  <dd className="mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {(refusal.employeeSignature || refusal.witnessSignature) ? (
              <div className="row g-3 mt-1">
                {refusal.employeeSignature ? (
                  <div className="col-md-6">
                    <div className="small text-muted mb-1">Employee signature</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refusal.employeeSignature}
                      alt="Employee signature"
                      className="img-fluid border rounded bg-white"
                      style={{ maxHeight: 100 }}
                    />
                  </div>
                ) : null}
                {refusal.witnessSignature ? (
                  <div className="col-md-6">
                    <div className="small text-muted mb-1">Witness signature</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refusal.witnessSignature}
                      alt="Witness signature"
                      className="img-fluid border rounded bg-white"
                      style={{ maxHeight: 100 }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="alert alert-warning small mt-3 mb-0" role="note">
              {MEDICAL_REFUSAL_EMERGENCY_NOTICE}
            </p>
          </div>
        ) : null}

        {onAttachmentsChange ? (
          <IncidentAttachmentsPanel
            incidentId={incident.id}
            attachments={incident.attachments}
            canManage={canManage}
            disabled={busy}
            onChange={onAttachmentsChange}
          />
        ) : null}
      </div>
    </div>
  );
}
