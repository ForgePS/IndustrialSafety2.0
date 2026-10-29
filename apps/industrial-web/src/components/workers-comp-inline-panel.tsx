"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { OshaInlinePanel } from "@/components/osha-inline-panel";
import { PersonnelSearchField } from "@/components/personnel-search-field";
import { WorkersCompCarrierSelect } from "@/components/workers-comp-carrier-select";
import {
  WC_API,
  wcCaseStatusOptions,
  wcNormalizeSeverity,
  wcSeverityHelp,
  wcSeverityOptions,
  WC_WORKFLOW_STAGES,
  toWorkersCompCase,
  wcCaseHref,
  wcClaimNumber,
  type WorkersCompCarrier,
  type WorkersCompCase,
} from "@/lib/workers-comp-module";

type Props = {
  caseId: string;
  /** Locked linked incident — shown read-only when embedding under incident create/edit. */
  lockedIncidentId?: string;
  lockedIncidentTitle?: string;
  canManage: boolean;
  onClose?: () => void;
  onSaved?: (record: WorkersCompCase) => void;
};

/**
 * Compact WC claim overview for embedding under an incident report
 * (Continue to Workers Comp flow), with optional Continue to OSHA.
 */
export function WorkersCompInlinePanel({
  caseId,
  lockedIncidentId,
  lockedIncidentTitle,
  canManage,
  onClose,
  onSaved,
}: Props) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canViewOsha =
    permissions.has("industrial.osha.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManageOsha =
    permissions.has("industrial.osha.manage") || permissions.has("industrial.admin");

  const [detail, setDetail] = useState<WorkersCompCase | null>(null);
  const [carriers, setCarriers] = useState<WorkersCompCarrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddedOshaCaseId, setEmbeddedOshaCaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [raw, carrierData] = await Promise.all([
        apiGet<unknown>(`${WC_API}/${encodeURIComponent(caseId)}`),
        apiGet<{ items?: WorkersCompCarrier[] }>(`${WC_API}/carriers`).catch(() => ({
          items: [] as WorkersCompCarrier[],
        })),
      ]);
      const mapped = toWorkersCompCase(raw);
      if (!mapped) throw new Error("Workers' comp case not found");
      setDetail(mapped);
      setCarriers(Array.isArray(carrierData.items) ? carrierData.items : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load workers' comp case");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persistCase(
    overrides: Partial<WorkersCompCase> = {},
  ): Promise<WorkersCompCase | null> {
    if (!canManage || !detail) return null;
    const next = { ...detail, ...overrides };
    const updated = await apiSend<unknown>(`${WC_API}/${encodeURIComponent(detail.id)}`, "PATCH", {
      status: next.status,
      severity: next.severity,
      workflowStage: next.workflowStage,
      personnelId: next.personnelId,
      workerName: next.workerName,
      dateOfBirth: next.dateOfBirth || undefined,
      street: next.street || undefined,
      city: next.city || undefined,
      state: next.state || undefined,
      zip: next.zip || undefined,
      gender: next.gender || undefined,
      incidentId: lockedIncidentId || next.incidentId,
      caseNumber: next.caseNumber,
      daysAway: next.daysAway,
      restrictedDays: next.restrictedDays,
      claimSummary: {
        ...next.claimSummary,
        claimNumber: next.caseNumber || next.claimSummary.claimNumber,
      },
      notes: next.notes,
      locationText: next.locationText,
      oshaRecordable: next.oshaRecordable,
      oshaPrivacyCase: next.oshaPrivacyCase,
      oshaJobTitle: next.oshaJobTitle,
      oshaIllnessCategory: next.oshaIllnessCategory,
      oshaCaseOutcome: next.oshaCaseOutcome,
    });
    const mapped = toWorkersCompCase(updated) ?? next;
    setDetail(mapped);
    onSaved?.(mapped);
    return mapped;
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !detail) return;
    setSaving(true);
    setError(null);
    try {
      await persistCase();
      setEmbeddedOshaCaseId(null);
      onClose?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save workers' comp case");
    } finally {
      setSaving(false);
    }
  }

  async function continueToOshaReport() {
    if (!canManage || !detail) return;
    const incidentId = lockedIncidentId || detail.incidentId;
    if (!incidentId) {
      setError("Link an injury incident on this case before continuing to OSHA.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mapped = await persistCase({ oshaRecordable: true });
      const oshaId = mapped?.oshaCaseId?.trim();
      if (!oshaId) {
        setError(
          "Case saved, but an OSHA Form 300 entry was not created. Confirm a linked injury incident and try again.",
        );
        return;
      }
      if (!canViewOsha) {
        setError("OSHA case was created, but you do not have permission to view OSHA cases.");
        return;
      }
      setEmbeddedOshaCaseId(oshaId);
      window.setTimeout(() => {
        document.getElementById("osha-inline-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save case and open OSHA");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card incidents-create mb-4" id="workers-comp-inline-panel">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h5 className="card-title mb-0">Workers&apos; compensation claim</h5>
            <p className="text-muted small mb-0 mt-1">
              {detail
                ? `Continue the claim for ${wcClaimNumber(detail)}${
                    detail.workerName ? ` · ${detail.workerName}` : ""
                  }.`
                : "Continue the workers' compensation claim for this incident."}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {detail ? (
              <Link className="btn btn-sm btn-outline-secondary" href={wcCaseHref(detail.id)}>
                Open full WC module
              </Link>
            ) : null}
            {onClose ? (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Done
              </button>
            ) : null}
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          ) : null}
          {loading || !detail ? (
            <p className="text-muted mb-0" role="status">
              {loading ? "Loading workers' comp claim…" : "Claim not found."}
            </p>
          ) : (
            <form className="row g-3" onSubmit={(ev) => void onSave(ev)}>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-status">
                  Status
                </label>
                <select
                  id="wc-inline-status"
                  className="form-select"
                  value={detail.status}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, status: e.target.value })}
                >
                  {wcCaseStatusOptions(detail.status).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-stage">
                  Workflow stage
                </label>
                <select
                  id="wc-inline-stage"
                  className="form-select"
                  value={detail.workflowStage || "INTAKE"}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, workflowStage: e.target.value })}
                >
                  {WC_WORKFLOW_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-severity">
                  Severity
                </label>
                <select
                  id="wc-inline-severity"
                  className="form-select"
                  value={wcNormalizeSeverity(detail.severity)}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, severity: e.target.value })}
                >
                  {!wcNormalizeSeverity(detail.severity) ? (
                    <option value="">Select severity</option>
                  ) : null}
                  {wcSeverityOptions(detail.severity).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {wcSeverityHelp(detail.severity) ? (
                  <div className="form-text">{wcSeverityHelp(detail.severity)}</div>
                ) : null}
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-claim">
                  Claim #
                </label>
                <input
                  id="wc-inline-claim"
                  className="form-control"
                  value={detail.caseNumber}
                  disabled={!canManage}
                  placeholder="Leave blank until assigned by insurance"
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      caseNumber: e.target.value,
                      claimSummary: {
                        ...detail.claimSummary,
                        claimNumber: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-carrier">
                  Carrier
                </label>
                <WorkersCompCarrierSelect
                  id="wc-inline-carrier"
                  carriers={carriers}
                  carrierId={detail.claimSummary.carrierId}
                  carrierName={detail.claimSummary.carrierName}
                  disabled={!canManage}
                  onChange={(next) =>
                    setDetail({
                      ...detail,
                      claimSummary: {
                        ...detail.claimSummary,
                        carrierId: next.carrierId,
                        carrierName: next.carrierName,
                      },
                    })
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-adjuster">
                  Adjuster
                </label>
                <input
                  id="wc-inline-adjuster"
                  className="form-control"
                  value={detail.claimSummary.adjuster}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      claimSummary: { ...detail.claimSummary, adjuster: e.target.value },
                    })
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-doi">
                  Date of injury
                </label>
                <input
                  id="wc-inline-doi"
                  type="date"
                  className="form-control"
                  value={detail.claimSummary.dateOfInjury}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      claimSummary: { ...detail.claimSummary, dateOfInjury: e.target.value },
                    })
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-days-away">
                  Days away
                </label>
                <input
                  id="wc-inline-days-away"
                  type="number"
                  className="form-control"
                  value={detail.daysAway ?? ""}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      daysAway: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="wc-inline-restricted">
                  Restricted days
                </label>
                <input
                  id="wc-inline-restricted"
                  type="number"
                  className="form-control"
                  value={detail.restrictedDays ?? ""}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      restrictedDays: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-md-6">
                <PersonnelSearchField
                  id="wc-inline-personnel"
                  label="Linked employee"
                  hint="Search Employee Profiles. Clears free-text worker name when unlinked."
                  disabled={!canManage}
                  personnelId={detail.personnelId ?? ""}
                  displayName={detail.workerName}
                  allowUnlinkedText
                  onLinkedChange={(selection) => {
                    if (!selection) {
                      setDetail({
                        ...detail,
                        personnelId: null,
                        workerName: "",
                        dateOfBirth: "",
                        street: "",
                        city: "",
                        state: "",
                        zip: "",
                        gender: "",
                      });
                      return;
                    }
                    setDetail({
                      ...detail,
                      personnelId: selection.personnelId,
                      workerName: selection.displayName,
                      dateOfBirth: selection.dateOfBirth || detail.dateOfBirth,
                      street: selection.street || detail.street,
                      city: selection.city || detail.city,
                      state: selection.state || detail.state,
                      zip: selection.zip || detail.zip,
                      gender: selection.gender || detail.gender,
                    });
                  }}
                  onUnlinkedTextChange={(value) =>
                    setDetail({
                      ...detail,
                      personnelId: null,
                      workerName: value,
                    })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="wc-inline-dob">
                  Date of birth
                </label>
                <input
                  id="wc-inline-dob"
                  type="date"
                  className="form-control"
                  value={detail.dateOfBirth || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, dateOfBirth: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="wc-inline-street">
                  Street
                </label>
                <input
                  id="wc-inline-street"
                  className="form-control"
                  value={detail.street || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, street: e.target.value })}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="wc-inline-city">
                  City
                </label>
                <input
                  id="wc-inline-city"
                  className="form-control"
                  value={detail.city || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, city: e.target.value })}
                />
              </div>
              <div className="col-md-1">
                <label className="form-label" htmlFor="wc-inline-state">
                  State
                </label>
                <input
                  id="wc-inline-state"
                  className="form-control"
                  value={detail.state || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, state: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="wc-inline-zip">
                  ZIP
                </label>
                <input
                  id="wc-inline-zip"
                  className="form-control"
                  value={detail.zip || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, zip: e.target.value })}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="wc-inline-sex">
                  Sex
                </label>
                <select
                  id="wc-inline-sex"
                  className="form-select"
                  value={detail.gender || ""}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, gender: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="wc-inline-incident">
                  Linked incident
                </label>
                <input
                  id="wc-inline-incident"
                  className="form-control"
                  value={
                    lockedIncidentTitle?.trim() ||
                    (lockedIncidentId ? `Linked incident` : detail.incidentId || "—")
                  }
                  disabled
                  readOnly
                />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="wc-inline-body">
                  Body parts / claim notes
                </label>
                <textarea
                  id="wc-inline-body"
                  className="form-control"
                  rows={2}
                  value={detail.claimSummary.bodyParts || detail.claimSummary.notes}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      claimSummary: {
                        ...detail.claimSummary,
                        bodyParts: e.target.value,
                        notes: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="wc-inline-notes">
                  Case notes
                </label>
                <textarea
                  id="wc-inline-notes"
                  className="form-control"
                  rows={2}
                  value={detail.notes}
                  disabled={!canManage}
                  onChange={(e) => setDetail({ ...detail, notes: e.target.value })}
                />
              </div>
              <div className="col-12">
                <div className="border rounded p-3 bg-body-tertiary">
                  <div className="form-check mb-2">
                    <input
                      id="wc-inline-osha-recordable"
                      className="form-check-input"
                      type="checkbox"
                      checked={detail.oshaRecordable}
                      disabled={!canManage}
                      onChange={(e) =>
                        setDetail({
                          ...detail,
                          oshaRecordable: e.target.checked,
                          oshaPrivacyCase: e.target.checked ? detail.oshaPrivacyCase : false,
                        })
                      }
                    />
                    <label className="form-check-label" htmlFor="wc-inline-osha-recordable">
                      OSHA recordable — autofill Form 300 from this case
                    </label>
                  </div>
                  {detail.oshaRecordable ? (
                    <div className="row g-3">
                      <div className="col-md-4">
                        <div className="form-check mt-4">
                          <input
                            id="wc-inline-osha-privacy"
                            className="form-check-input"
                            type="checkbox"
                            checked={detail.oshaPrivacyCase}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({ ...detail, oshaPrivacyCase: e.target.checked })
                            }
                          />
                          <label className="form-check-label" htmlFor="wc-inline-osha-privacy">
                            Privacy case
                          </label>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="wc-inline-osha-job">
                          Job title (Form 300 col C)
                        </label>
                        <input
                          id="wc-inline-osha-job"
                          className="form-control"
                          value={detail.oshaJobTitle}
                          disabled={!canManage}
                          onChange={(e) => setDetail({ ...detail, oshaJobTitle: e.target.value })}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="wc-inline-osha-illness">
                          Classification (M)
                        </label>
                        <select
                          id="wc-inline-osha-illness"
                          className="form-select"
                          value={detail.oshaIllnessCategory || "1"}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDetail({ ...detail, oshaIllnessCategory: e.target.value })
                          }
                        >
                          <option value="1">(1) Injury</option>
                          <option value="2">(2) Skin disorder</option>
                          <option value="3">(3) Respiratory condition</option>
                          <option value="4">(4) Poisoning</option>
                          <option value="5">(5) Hearing loss</option>
                          <option value="6">(6) All other illnesses</option>
                        </select>
                      </div>
                      <div className="col-12">
                        <p className="small text-muted mb-0">
                          Requires a linked injury incident. Continue creates or updates the OSHA
                          Form 300 entry below. OSHA can also be entered from the Incidents module
                          without a workers&apos; compensation claim.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              {canManage ? (
                <div className="col-12 d-flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving…" : "Save & Close"}
                  </button>
                  {detail.oshaRecordable ? (
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={saving}
                      onClick={() => void continueToOshaReport()}
                    >
                      {saving ? "Saving…" : "Continue to OSHA report"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </form>
          )}
        </div>
      </div>
      {embeddedOshaCaseId && detail && canViewOsha ? (
        <OshaInlinePanel
          caseId={embeddedOshaCaseId}
          canManage={canManageOsha}
          lockedWorkersCompClaim={wcClaimNumber(detail)}
          onClose={() => setEmbeddedOshaCaseId(null)}
        />
      ) : null}
    </>
  );
}
