"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { PersonnelProfilePanels } from "@/components/personnel-profile-panels";
import { PersonnelFirstAidCertCopiesCard } from "@/components/personnel-first-aid-cert-copies-card";
import { LicenseCopiesCard } from "@/components/license-copies-card";
import { CompanyDriverMvrPanel } from "@/components/company-driver-mvr-panel";
import { PersonnelSmsAuthorizationPanel } from "@/components/personnel-sms-authorization-panel";
import {
  buildPersonnelFile,
  personnelLicenseCopies,
  personnelSignature,
  resolvePersonnelLocationLabel,
  type PersonnelFileGroup,
} from "@/lib/personnel-file";
import { personEditHref, toRosterPerson, type RosterPerson } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";
import { loadPersonnelLookups, resolveLookupLabel, EMPTY_LOOKUPS } from "@/lib/personnel-lookups";
import type { LookupState } from "@/lib/personnel-lookups";
import { parseMvrAuditHistory } from "@/lib/mvr-sample";
import { parseCompanyDriverMvrSnapshot } from "@/lib/company-driver-mvr-requirements";
import { formatApiErrorMessage } from "@/lib/api-error";
import { dotFileHref, isIndustrialRecordUuid } from "@/lib/dot-compliance-module";
import { ForgePrintButton } from "@/components/forge-print-button";
import { personnelPrintFieldValues } from "@/lib/module-print-fields";

const ROSTER_HREF = "/modules/personnel/";
const ARCHIVED_ROSTER_HREF = "/modules/personnel/?view=archived";
const COMPANY_DRIVERS_HREF = "/modules/personnel/?view=company-drivers";

type TrainingRecord = {
  id: string;
  title?: string | null;
  courseName?: string | null;
  status?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
};

type PersonnelRecord = Record<string, unknown> & { training?: TrainingRecord[] };

function SectionCard({ group }: { group: PersonnelFileGroup }) {
  return (
    <div className="card mb-3">
      <div className="card-header d-flex align-items-center gap-3">
        {group.icon ? (
          <div className="avatar avatar-sm flex-shrink-0">
            <span className="avatar-initial rounded bg-label-primary">
              <i className={`bx ${group.icon}`} aria-hidden="true" />
            </span>
          </div>
        ) : null}
        <h6 className="card-title mb-0">{group.title}</h6>
      </div>
      <div className="card-body">
        <dl className="row mb-0">
          {group.rows.map((row) => (
            <div className={row.wide ? "col-12 mb-3" : "col-md-6 mb-3"} key={row.label}>
              <dt className="text-muted small text-uppercase fw-normal">{row.label}</dt>
              <dd className={`mb-0${row.wide ? " text-break" : ""}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function PersonnelFileInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") ?? "";
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.personnel.manage") || permissions.has("industrial.admin");
  const canFillForms =
    permissions.has("industrial.forms.fill") ||
    permissions.has("industrial.forms.manage") ||
    permissions.has("industrial.admin");

  const [record, setRecord] = useState<PersonnelRecord | null>(null);
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFullRecord, setShowFullRecord] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("No person was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<PersonnelRecord>(
        `/api/v1/industrial/personnel/${encodeURIComponent(id)}`,
      );
      setRecord(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load this personnel file");
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await loadPersonnelLookups(me?.tenantId);
      if (!cancelled) setLookups(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId]);

  const isArchived = Boolean(
    record?.archivedAt && String(record.archivedAt).trim() !== "",
  );

  async function archivePerson() {
    if (!id || !canManage || busy) return;
    const name =
      personNameDisplay(
        typeof record?.displayName === "string" ? record.displayName : null,
        "this person",
      ) || "this person";
    const ok = window.confirm(
      `Archive ${name}?\n\nThey will be removed from the active roster and training portal lookups. You can restore them later from Archived Personnel.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${encodeURIComponent(id)}/archive`, "POST", {});
      router.push(ARCHIVED_ROSTER_HREF);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not archive this person"));
    } finally {
      setBusy(false);
    }
  }

  async function restorePerson() {
    if (!id || !canManage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${encodeURIComponent(id)}/unarchive`, "POST", {});
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not restore this person"));
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-lock-alt fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">Personnel file</h5>
          <p className="mb-0">
            You do not have permission to view personnel records. Missing{" "}
            <code>industrial.personnel.view</code>.
          </p>
        </div>
      </div>
    );
  }

  const personBase = record ? toRosterPerson(record) : null;
  const person: RosterPerson | null = personBase
    ? {
        ...personBase,
        departmentName:
          personBase.departmentName ||
          (typeof record?.departmentId === "string"
            ? (resolveLookupLabel(lookups, "departments", record.departmentId) ?? "")
            : "") ||
          (typeof record?.department === "string" ? record.department.trim() : ""),
      }
    : null;
  const groups = record
    ? buildPersonnelFile(record, (source, lookupId) =>
        resolveLookupLabel(lookups, source, lookupId),
      )
    : [];
  const signature = record ? personnelSignature(record) : null;
  const siteName = record
    ? resolvePersonnelLocationLabel(record, (siteId) => resolveLookupLabel(lookups, "sites", siteId))
    : undefined;
  const mvrAudits = record ? parseMvrAuditHistory(record.mvrAuditHistory) : [];
  const licenseCopies = record ? personnelLicenseCopies(record) : { front: null, back: null };
  const needsLicenseCopies =
    person?.isDotDriver === true || record?.requiresLicenseCopies === true;
  const companyDriverMvr = record ? parseCompanyDriverMvrSnapshot(record.companyDriverMvr) : null;
  const linkedDotRecordId =
    record && typeof record.dotRecordId === "string" && isIndustrialRecordUuid(record.dotRecordId)
      ? record.dotRecordId
      : null;
  const linkedCompanyDriverId =
    record &&
    typeof record.companyDriverId === "string" &&
    isIndustrialRecordUuid(record.companyDriverId)
      ? record.companyDriverId
      : null;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 py-3">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb breadcrumb-style1 mb-1">
              <li className="breadcrumb-item">
                <Link href={ROSTER_HREF}>Personnel</Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {personNameDisplay(person?.displayName, "Personnel file")}
              </li>
            </ol>
          </nav>
          <h4 className="fw-bold mb-0">
            Personnel profile
            {isArchived ? (
              <span className="badge bg-label-secondary ms-2 align-middle">Archived</span>
            ) : null}
          </h4>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {linkedDotRecordId ? (
            <Link className="btn btn-outline-primary" href={dotFileHref(linkedDotRecordId)}>
              <i className="bx bx-folder-open me-1" aria-hidden="true" />
              Open DQF / DOT file
            </Link>
          ) : null}
          {linkedCompanyDriverId || person?.isCompanyDriver ? (
            <Link className="btn btn-outline-primary" href={COMPANY_DRIVERS_HREF}>
              <i className="bx bx-car me-1" aria-hidden="true" />
              Company drivers roster
            </Link>
          ) : null}
          {canManage && id && !isArchived ? (
            <Link className="btn btn-primary" href={personEditHref(id)}>
              <i className="bx bx-edit me-1" aria-hidden="true" />
              Edit person
            </Link>
          ) : null}
          {person && id ? (
            <ForgePrintButton
              module="PERSONNEL"
              recordType="personnel"
              recordId={id}
              className="btn btn-outline-secondary"
              fieldValues={personnelPrintFieldValues(person as Record<string, unknown>)}
              label="Print Label"
            />
          ) : null}
          {canManage && id && !isArchived ? (
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={busy || loading}
              onClick={() => void archivePerson()}
            >
              <i className="bx bx-archive me-1" aria-hidden="true" />
              {busy ? "Archiving…" : "Archive / remove"}
            </button>
          ) : null}
          {canManage && id && isArchived ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || loading}
              onClick={() => void restorePerson()}
            >
              <i className="bx bx-undo me-1" aria-hidden="true" />
              {busy ? "Restoring…" : "Restore to roster"}
            </button>
          ) : null}
          <Link className="btn btn-outline-secondary" href={isArchived ? ARCHIVED_ROSTER_HREF : ROSTER_HREF}>
            <i className="bx bx-arrow-back me-1" aria-hidden="true" />
            Back to directory
          </Link>
        </div>
      </div>

      {isArchived ? (
        <div className="alert alert-secondary" role="status">
          This person is archived and hidden from the active roster. Training and form history is
          retained. Use Restore to put them back on the roster.
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <i className="bx bx-error-circle fs-5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status" aria-live="polite">
          Loading personnel profile…
        </p>
      ) : person && record ? (
        <>
          <PersonnelProfilePanels
            person={person}
            record={record}
            {...(siteName ? { siteLabel: siteName } : {})}
            canManage={canManage}
          />

          <PersonnelFirstAidCertCopiesCard personnelId={id} record={record} />

          <PersonnelSmsAuthorizationPanel
            personnelId={id}
            record={record}
            canManage={canManage}
            onRecordChange={(next) => setRecord((prev) => ({ ...(prev ?? {}), ...next }))}
          />

          <LicenseCopiesCard
            copies={licenseCopies}
            record={record}
            personName={personNameDisplay(person.displayName)}
            required={needsLicenseCopies}
          />

          {person.isCompanyDriver ? (
            <div className="card mb-4 mt-4">
              <div className="card-body">
                <CompanyDriverMvrPanel
                  personnelId={id}
                  snapshot={companyDriverMvr}
                  canFillForms={canFillForms}
                  canUploadPaper={canManage}
                />
              </div>
            </div>
          ) : null}

          {mvrAudits.length > 0 ? (
            <div className="card mb-4 mt-4">
              <div className="card-header">
                <h6 className="card-title mb-0">MVR audit history</h6>
              </div>
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Year</th>
                      <th scope="col">Audited</th>
                      <th scope="col">By</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mvrAudits.map((entry) => (
                      <tr key={`${entry.year}-${entry.auditedAt}-${entry.driverId}`}>
                        <td>{entry.year}</td>
                        <td>{entry.auditedAt.slice(0, 10)}</td>
                        <td>{entry.auditedByName || "—"}</td>
                        <td>{entry.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 mt-4">
            <h6 className="text-muted text-uppercase mb-0">Full personnel record</h6>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowFullRecord((v) => !v)}
              aria-expanded={showFullRecord}
            >
              {showFullRecord ? "Hide details" : "Show details"}
            </button>
          </div>

          {showFullRecord ? (
            <div className="row g-4">
              <div className="col-lg-8">
                {groups.length === 0 ? (
                  <div className="card">
                    <div className="card-body text-center py-4">
                      <p className="text-muted mb-0">No additional field details recorded.</p>
                    </div>
                  </div>
                ) : (
                  groups.map((group) => <SectionCard group={group} key={group.id} />)
                )}
              </div>
              <div className="col-lg-4">
                {signature ? (
                  <div className="card">
                    <div className="card-header">
                      <h5 className="card-title mb-0">Signature</h5>
                    </div>
                    <div className="card-body">
                      {/* Signatures are stored as inline data URLs. */}
                      <img
                        src={signature}
                        alt={`Signature for ${personNameDisplay(person.displayName)}`}
                        className="img-fluid border rounded bg-white"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function PersonnelFilePage() {
  return (
    <Suspense
      fallback={
        <p className="text-muted" role="status">
          Loading personnel profile…
        </p>
      }
    >
      <PersonnelFileInner />
    </Suspense>
  );
}
