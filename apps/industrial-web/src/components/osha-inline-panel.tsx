"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  OshaCaseEditor,
  type OshaCaseEditorSave,
} from "@/components/osha/osha-case-editor";
import {
  buildForm301Pdf,
  fetchForm301Template,
  openForm301PdfForPrint,
} from "@/lib/osha-form-301-pdf";
import { OSHA_API, toOshaCase, type OshaCase } from "@/lib/osha-module";

type Props = {
  caseId: string;
  canManage: boolean;
  lockedWorkersCompClaim?: string;
  /** When opened from Incidents without a WC claim. */
  lockedIncidentTitle?: string;
  onClose?: () => void;
  onSaved?: (record: OshaCase) => void;
};

/**
 * Compact OSHA Form 300/301 editor for embedding under an incident or
 * workers' comp case (Continue to OSHA flow).
 */
export function OshaInlinePanel({
  caseId,
  canManage,
  lockedWorkersCompClaim,
  lockedIncidentTitle,
  onClose,
  onSaved,
}: Props) {
  const [caseRow, setCaseRow] = useState<OshaCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing301, setPrinting301] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiGet<Record<string, unknown>>(`${OSHA_API}/${encodeURIComponent(caseId)}`);
      const mapped = toOshaCase(raw);
      if (!mapped.id) throw new Error("OSHA case not found");
      setCaseRow(mapped);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load OSHA case");
      setCaseRow(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(body: OshaCaseEditorSave) {
    if (!canManage || !caseRow) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `${OSHA_API}/${encodeURIComponent(caseRow.id)}`,
        "PATCH",
        body,
      );
      const mapped = toOshaCase(updated);
      setCaseRow(mapped);
      onSaved?.(mapped);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save OSHA case");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function onPrint301() {
    if (!caseRow) return;
    setPrinting301(true);
    setError(null);
    try {
      const template = await fetchForm301Template();
      const pdfBytes = await buildForm301Pdf(template, caseRow);
      const label = caseRow.caseNumber || caseRow.id.slice(0, 8);
      const warn = openForm301PdfForPrint(pdfBytes, `osha-form-301-${label}.pdf`);
      if (warn) setError(warn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build Form 301 PDF");
    } finally {
      setPrinting301(false);
    }
  }

  return (
    <div className="mb-4" id="osha-inline-panel">
      <div className="card mb-3">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h5 className="card-title mb-0">OSHA Form 300 / 301</h5>
            <p className="text-muted small mb-0 mt-1">
              {lockedWorkersCompClaim
                ? `Continue Form 300 / 301 for workers' comp claim ${lockedWorkersCompClaim}.`
                : lockedIncidentTitle
                  ? `Enter OSHA information for incident “${lockedIncidentTitle}”. A workers' compensation claim is not required.`
                  : "Enter Form 300 / 301 details for this case. A workers' compensation claim is not required."}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link className="btn btn-sm btn-outline-secondary" href="/modules/osha/">
              Open full OSHA module
            </Link>
            {onClose ? (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Done
              </button>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="card-body pb-0">
            <div className="alert alert-danger mb-0" role="alert">
              {error}
            </div>
          </div>
        ) : null}
        {loading || !caseRow ? (
          <div className="card-body">
            <p className="text-muted mb-0" role="status">
              {loading ? "Loading OSHA case…" : "OSHA case not found."}
            </p>
          </div>
        ) : null}
      </div>
      {caseRow && !loading ? (
        <OshaCaseEditor
          caseRow={caseRow}
          canManage={canManage}
          saving={saving}
          printing301={printing301}
          onSave={onSave}
          onClose={onClose ?? (() => undefined)}
          onPrint301={() => void onPrint301()}
        />
      ) : null}
    </div>
  );
}
