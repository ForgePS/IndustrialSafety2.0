"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { PersonnelProfilePanels } from "@/components/personnel-profile-panels";
import {
  buildPersonnelFile,
  personnelSignature,
  type PersonnelFileGroup,
} from "@/lib/personnel-file";
import { personEditHref, toRosterPerson, type RosterPerson } from "@/lib/personnel-directory";
import { loadPersonnelLookups, resolveLookupLabel, EMPTY_LOOKUPS } from "@/lib/personnel-lookups";
import type { LookupState } from "@/lib/personnel-lookups";

const ROSTER_HREF = "/modules/personnel/";

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
  const id = searchParams.get("id") ?? "";
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.personnel.manage") || permissions.has("industrial.admin");

  const [record, setRecord] = useState<PersonnelRecord | null>(null);
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const person: RosterPerson | null = record ? toRosterPerson(record) : null;
  const groups = record
    ? buildPersonnelFile(record, (source, lookupId) =>
        resolveLookupLabel(lookups, source, lookupId),
      )
    : [];
  const signature = record ? personnelSignature(record) : null;
  const siteName = person?.siteId
    ? resolveLookupLabel(lookups, "sites", person.siteId)
    : undefined;

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
                {person?.displayName ?? "Personnel file"}
              </li>
            </ol>
          </nav>
          <h4 className="fw-bold mb-0">Personnel profile</h4>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {canManage && id ? (
            <Link className="btn btn-primary" href={personEditHref(id)}>
              <i className="bx bx-edit me-1" aria-hidden="true" />
              Edit person
            </Link>
          ) : null}
          <Link className="btn btn-outline-secondary" href={ROSTER_HREF}>
            <i className="bx bx-arrow-back me-1" aria-hidden="true" />
            Back to directory
          </Link>
        </div>
      </div>

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
                        alt={`Signature for ${person.displayName}`}
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
