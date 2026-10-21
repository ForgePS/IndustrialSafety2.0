"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import {
  buildProfileMetrics,
  completedPersonnelForms,
  describeDisciplineImpact,
  describeObservationImpact,
  emptyPersonnelProfileAnalytics,
  formSubmissionHref,
  itemsForSection,
  moduleListHref,
  sectionTitle,
  type PersonnelProfileAnalytics,
  type ProfileActivityItem,
  type ProfileMetric,
  type ProfileSectionId,
} from "@/lib/personnel-profile-analytics";
import {
  formatPpeDateValue,
  ppeExpiryBadgeClass,
  ppeExpiryLabel,
} from "@/lib/personnel-ppe";
import {
  rosterInitials,
  statusBadgeClass,
  personEditHref,
  type RosterPerson,
} from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";
import { formatFileDate, resolvePersonnelLocationLabel, stripImportNotes } from "@/lib/personnel-file";
import { PersonnelTrainingHistory } from "@/components/personnel-training-history";
import { PersonnelDisciplinaryActions } from "@/components/personnel-disciplinary-actions";

type Props = {
  person: RosterPerson;
  record: Record<string, unknown>;
  siteLabel?: string;
  canManage: boolean;
};

function shortDate(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "—";
  return formatFileDate(value);
}

function MetricCard({
  metric,
  active,
  onOpen,
}: {
  metric: ProfileMetric;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`card h-100 border text-start w-100 ind-profile-metric${active ? " border-primary" : ""}`}
      onClick={onOpen}
      aria-pressed={active}
    >
      <div className="card-body py-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div>
            <small className="text-muted text-uppercase d-block">{metric.label}</small>
            <span className="fs-3 fw-bold">{metric.value}</span>
            <small className="text-muted d-block">{metric.sub}</small>
          </div>
          <i className="bx bx-chevron-right text-muted" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

function ActivityList({
  items,
  empty,
}: {
  items: ProfileActivityItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted mb-0">{empty}</p>;
  }
  return (
    <div className="list-group list-group-flush">
      {items.map((item) => (
        <div
          key={item.id}
          className="list-group-item d-flex justify-content-between align-items-start gap-3 px-0"
        >
          <div className="min-w-0">
            <Link
              href={formSubmissionHref(item)}
              className="d-block text-truncate fw-medium text-body"
            >
              {item.label}
            </Link>
            <small className="text-muted">
              {item.module}
              {item.status ? ` · ${item.status}` : ""}
            </small>
          </div>
          <div className="d-flex flex-column align-items-end gap-1 flex-shrink-0">
            <small className="text-muted text-nowrap">{item.date.slice(0, 10)}</small>
            <div className="d-flex gap-2">
              <Link className="btn btn-link btn-sm px-0 py-0" href={formSubmissionHref(item)}>
                View
              </Link>
              {item.module === "forms" ? (
                <FormPrintLink submissionId={item.id} />
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FormPrintLink({ submissionId }: { submissionId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-link btn-sm px-0 py-0"
      disabled={busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const data = await apiGet<{ html?: string }>(
              `/api/v1/industrial/form-submissions/${encodeURIComponent(submissionId)}/printable`,
            );
            if (data.html) {
              const { openPrintableHtmlPopup } = await import("@/lib/dvir");
              openPrintableHtmlPopup(data.html);
            }
          } catch {
            // Fill view remains available via View.
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {busy ? "…" : "Print"}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small className="text-muted text-uppercase d-block">{label}</small>
      <span className="fw-medium">{value}</span>
    </div>
  );
}

function PpeDateRow({
  label,
  expiresDate,
  issuedDate,
}: {
  label: string;
  expiresDate: unknown;
  issuedDate?: unknown;
}) {
  const formatted = formatPpeDateValue(expiresDate, new Date(), issuedDate);
  if (formatted.date === "") {
    return <DetailRow label={label} value="Not set" />;
  }
  const status = formatted.status;
  return (
    <div>
      <small className="text-muted text-uppercase d-block">{label}</small>
      <span className="fw-medium">{formatted.date}</span>
      {status !== "none" && status !== "ok" ? (
        <span className={`badge ms-2 ${ppeExpiryBadgeClass(status)}`}>
          {ppeExpiryLabel(status)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Legacy-style personnel safety profile: navy header, safety score, analytics
 * grid, involvement panels, activity, and forms — every section opens related
 * records in the owning module.
 */
export function PersonnelProfilePanels({ person, record, siteLabel, canManage }: Props) {
  const [analytics, setAnalytics] = useState<PersonnelProfileAnalytics>(() =>
    emptyPersonnelProfileAnalytics(person.id),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ProfileSectionId | null>(null);
  const [personnelFormsExpanded, setPersonnelFormsExpanded] = useState(false);
  const [attachedFormsExpanded, setAttachedFormsExpanded] = useState(false);
  const [recentActivityExpanded, setRecentActivityExpanded] = useState(false);
  const [analyticsVersion, setAnalyticsVersion] = useState(0);
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canManageDiscipline =
    permissions.has("industrial.personnel.discipline.manage") || permissions.has("industrial.admin");
  const canViewDiscipline =
    canManageDiscipline || permissions.has("industrial.personnel.discipline.view");

  useEffect(() => {
    let cancelled = false;
    if (analyticsVersion === 0) setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<PersonnelProfileAnalytics>(
          `/api/v1/industrial/personnel/${encodeURIComponent(person.id)}/analytics`,
        );
        if (!cancelled) {
          setAnalytics({
            ...emptyPersonnelProfileAnalytics(person.id),
            ...data,
            workersComp: data.workersComp ?? emptyPersonnelProfileAnalytics(person.id).workersComp,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load safety analytics");
          setAnalytics(emptyPersonnelProfileAnalytics(person.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [person.id, analyticsVersion]);

  const searchHint =
    person.employeeNumber || person.displayName || (analytics as { searchHint?: string }).searchHint || "";
  const metrics = buildProfileMetrics(analytics, searchHint);
  const completedForms = completedPersonnelForms(analytics);
  const place =
    siteLabel ||
    resolvePersonnelLocationLabel({ ...person, ...record }) ||
    person.departmentName ||
    "No org unit assigned";

  const middleRaw =
    (typeof record.middleName === "string" && record.middleName.trim()) ||
    (typeof record.middleInitial === "string" && record.middleInitial.trim()) ||
    "";
  const middle = middleRaw ? personNameDisplay(middleRaw) : "—";
  const suffix = (typeof record.suffix === "string" && record.suffix.trim()) || "—";
  const email = person.email || "—";
  const phone = (typeof record.phone === "string" && record.phone.trim()) || "—";
  const hireDate = shortDate(record.hireDate);
  const dateOfBirth = shortDate(record.dateOfBirth);
  const notes = stripImportNotes(typeof record.notes === "string" ? record.notes : "");
  const preferred = personNameDisplay(
    (typeof record.preferredName === "string" && record.preferredName.trim()) ||
      (typeof record.goesBy === "string" && record.goesBy.trim()) ||
      "",
  );
  const displayName = personNameDisplay(person.displayName);

  function openSection(section: ProfileSectionId) {
    setActiveSection((prev) => (prev === section ? null : section));
  }

  const sectionItems = activeSection ? itemsForSection(analytics, activeSection) : [];
  const observationImpact = describeObservationImpact(analytics.observations.scoreImpact);
  const disciplineImpact = describeDisciplineImpact(analytics.discipline);

  return (
    <div className="ind-personnel-profile">
      <section className="card mb-4">
        <div className="card-header d-flex flex-wrap align-items-start gap-3">
          <div className="avatar avatar-lg flex-shrink-0">
            <span className="avatar-initial rounded bg-label-primary">
              {rosterInitials(displayName)}
            </span>
          </div>
          <div className="flex-grow-1 min-w-0">
            <h5 className="mb-1">{displayName}</h5>
            {preferred ? (
              <p className="text-muted small mb-1">Goes by &ldquo;{preferred}&rdquo;</p>
            ) : null}
            <p className="text-muted mb-1">
              {person.jobTitle || "Team MEMBER"}
              {person.employeeNumber ? ` · ${person.employeeNumber}` : ""}
            </p>
            <p className="text-muted mb-0">{place}</p>
          </div>
          <div className="text-center border rounded px-3 py-2" style={{ maxWidth: 260 }}>
            <small className="text-muted text-uppercase d-block">Safety score</small>
            <span className="fs-4 fw-bold">{loading ? "…" : analytics.safetyScore}</span>
            {!loading && observationImpact ? (
              <small className="text-muted d-block">Observations: {observationImpact}</small>
            ) : null}
            {!loading && disciplineImpact ? (
              <small className="text-danger d-block">Discipline: {disciplineImpact}</small>
            ) : null}
          </div>
        </div>

        <div className="card-body pt-3">
          <div className="row g-3">
            <div className="col-6 col-md-4 col-lg">
              <small className="text-muted text-uppercase d-block">Status</small>
              {person.status ? (
                <span className={`badge ${statusBadgeClass(person.status)}`}>
                  {person.status}
                </span>
              ) : (
                <span className="fw-medium">—</span>
              )}
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Middle name / initial" value={middle} />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Suffix" value={suffix} />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow
                label="Department"
                value={
                  person.departmentName ||
                  (typeof record.department === "string" ? record.department : "") ||
                  "—"
                }
              />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Email" value={email} />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Phone" value={phone} />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <div>
                <small className="text-muted text-uppercase d-block">DOT Driver</small>
                <span className="fw-medium">{person.isDotDriver ? "Yes" : "No"}</span>
                {typeof record.dotRecordId === "string" && record.dotRecordId.trim() ? (
                  <div>
                    <Link
                      className="btn btn-link btn-sm px-0"
                      href={`/modules/dot-compliance/file/?id=${encodeURIComponent(record.dotRecordId)}`}
                    >
                      Open DQF file
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="col-6 col-md-4 col-lg">
              <div>
                <small className="text-muted text-uppercase d-block">Company Driver</small>
                <span className="fw-medium">
                  {person.isCompanyDriver ? "Yes — on roster" : "No"}
                </span>
                {person.isCompanyDriver ? (
                  <div>
                    <Link
                      className="btn btn-link btn-sm px-0"
                      href="/modules/personnel/?view=company-drivers"
                    >
                      Open company drivers
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="col-6 col-md-4 col-lg">
              <PpeDateRow
                label="Glasses expires"
                expiresDate={record.prescriptionSafetyGlassesExpiresDate}
                issuedDate={record.prescriptionSafetyGlassesIssuedDate}
              />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <PpeDateRow
                label="Footwear expires"
                expiresDate={record.safetyFootwearExpiresDate}
                issuedDate={record.safetyFootwearIssuedDate}
              />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Hire date" value={hireDate} />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Date of birth" value={dateOfBirth} />
            </div>
          </div>
          {notes ? <p className="text-muted small mt-3 mb-0 text-break">{notes}</p> : null}
        </div>
      </section>

      {error ? (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="card mb-4">
          <div className="card-body text-center text-muted py-5" role="status">
            Loading safety analytics…
          </div>
        </div>
      ) : (
        <>
          <section className="mb-4" aria-labelledby="safety-analytics-title">
            <h6
              className="text-muted text-uppercase mb-3"
              id="safety-analytics-title"
            >
              Safety analytics
            </h6>
            <div className="row g-3">
              {metrics.map((metric) => (
                <div className="col-6 col-lg-3" key={metric.id}>
                  <MetricCard
                    metric={metric}
                    active={activeSection === metric.section}
                    onOpen={() => openSection(metric.section)}
                  />
                </div>
              ))}
            </div>
          </section>

          {activeSection ? (
            <section className="card mb-4" aria-live="polite">
              <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h5 className="card-title mb-0">{sectionTitle(activeSection)}</h5>
                <div className="d-flex gap-2">
                  <Link
                    className="btn btn-sm btn-outline-primary"
                    href={
                      metrics.find((m) => m.section === activeSection)?.href ??
                      moduleListHref("personnel")
                    }
                  >
                    Open module
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setActiveSection(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="card-body">
                <ActivityList
                  items={sectionItems}
                  empty="No linked records for this section yet. Open the module to add or search."
                />
              </div>
            </section>
          ) : null}

          <div className="row g-4 mb-4">
            <div className="col-lg-6">
              <button
                type="button"
                className={`card h-100 w-100 text-start border${
                  activeSection === "incidents" ? " border-primary" : ""
                }`}
                onClick={() => openSection("incidents")}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="card-title mb-0">Incident involvement</h5>
                    <i className="bx bx-chevron-right" aria-hidden="true" />
                  </div>
                  <dl className="mb-0">
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">As injured/reported EMPLOYEE</dt>
                      <dd className="mb-0 fw-semibold">{analytics.incidents.asSubject}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">As reporter</dt>
                      <dd className="mb-0 fw-semibold">{analytics.incidents.asReporter}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">OSHA recordable</dt>
                      <dd className="mb-0 fw-semibold">{analytics.incidents.recordable}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3">
                      <dt className="text-muted fw-normal">Last incident date</dt>
                      <dd className="mb-0 fw-semibold">
                        {analytics.incidents.lastDate?.slice(0, 10) || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </button>
            </div>
            <div className="col-lg-6">
              <button
                type="button"
                className={`card h-100 w-100 text-start border${
                  activeSection === "workers-comp" ? " border-primary" : ""
                }`}
                onClick={() => openSection("workers-comp")}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="card-title mb-0">Workers&apos; compensation</h5>
                    <i className="bx bx-chevron-right" aria-hidden="true" />
                  </div>
                  <dl className="mb-0">
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">Total cases</dt>
                      <dd className="mb-0 fw-semibold">{analytics.workersComp.total}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">Open cases</dt>
                      <dd className="mb-0 fw-semibold">{analytics.workersComp.open}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3">
                      <dt className="text-muted fw-normal">Last case date</dt>
                      <dd className="mb-0 fw-semibold">
                        {analytics.workersComp.lastDate?.slice(0, 10) || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </button>
            </div>
            <div className="col-lg-6">
              <button
                type="button"
                className={`card h-100 w-100 text-start border${
                  activeSection === "qualifications" ? " border-primary" : ""
                }`}
                onClick={() => openSection("qualifications")}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="card-title mb-0">Training &amp; qualifications</h5>
                    <i className="bx bx-chevron-right" aria-hidden="true" />
                  </div>
                  <dl className="mb-0">
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">Open assignments</dt>
                      <dd className="mb-0 fw-semibold">{analytics.training.openAssignments}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">In progress</dt>
                      <dd className="mb-0 fw-semibold">{analytics.training.inProgress}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">Expired qualifications</dt>
                      <dd className="mb-0 fw-semibold">{analytics.qualifications.expired}</dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3 mb-2">
                      <dt className="text-muted fw-normal">Expiring soon</dt>
                      <dd className="mb-0 fw-semibold">
                        {analytics.qualifications.expiringSoon}
                      </dd>
                    </div>
                    <div className="d-flex justify-content-between gap-3">
                      <dt className="text-muted fw-normal">Last training activity</dt>
                      <dd className="mb-0 fw-semibold">
                        {analytics.training.lastActivityDate?.slice(0, 10) || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </button>
            </div>
          </div>

          <PersonnelTrainingHistory personnelId={person.id} />

          {canViewDiscipline ? (
            <PersonnelDisciplinaryActions
              personnelId={person.id}
              canManage={canManageDiscipline}
              onChanged={() => setAnalyticsVersion((v) => v + 1)}
            />
          ) : null}

          <section className="card mb-4">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
              onClick={() => setPersonnelFormsExpanded((expanded) => !expanded)}
              aria-expanded={personnelFormsExpanded}
              aria-controls="personnel-forms-content"
            >
              <span>
                <h5 className="card-title mb-0">Personnel forms</h5>
                <small className="text-muted">
                  {completedForms.length} completed
                </small>
              </span>
              <i
                className={`bx bx-chevron-${personnelFormsExpanded ? "up" : "down"}`}
                aria-hidden="true"
              />
            </button>
            {personnelFormsExpanded ? (
              <div className="card-body pt-0" id="personnel-forms-content">
                <ActivityList
                  items={completedForms}
                  empty="No completed personnel forms are attached to this profile."
                />
                <Link
                  className="btn btn-sm btn-outline-primary mt-2"
                  href={`/modules/forms/?tab=library&personnel=${encodeURIComponent(person.id)}`}
                >
                  Fill a form for this person
                </Link>
              </div>
            ) : null}
          </section>

          <section className="card mb-4">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
              onClick={() => setAttachedFormsExpanded((expanded) => !expanded)}
              aria-expanded={attachedFormsExpanded}
              aria-controls="attached-forms-content"
            >
              <span>
                <h5 className="card-title mb-0">Attached forms</h5>
                <small className="text-muted">
                  {analytics.forms.submissions.length} attached
                </small>
              </span>
              <i
                className={`bx bx-chevron-${attachedFormsExpanded ? "up" : "down"}`}
                aria-hidden="true"
              />
            </button>
            {attachedFormsExpanded ? (
              <div className="card-body pt-0" id="attached-forms-content">
                <ActivityList
                  items={analytics.forms.submissions}
                  empty="No forms have been submitted for this profile yet."
                />
              </div>
            ) : null}
          </section>

          <section className="card mb-4">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
              onClick={() => setRecentActivityExpanded((open) => !open)}
              aria-expanded={recentActivityExpanded}
              aria-controls="personnel-recent-activity-content"
            >
              <span>
                <h5 className="card-title mb-0">Recent activity</h5>
                <small className="text-muted">
                  {analytics.recentActivity.length} item
                  {analytics.recentActivity.length === 1 ? "" : "s"}
                </small>
              </span>
              <i
                className={`bx bx-chevron-${recentActivityExpanded ? "up" : "down"}`}
                aria-hidden="true"
              />
            </button>
            {recentActivityExpanded ? (
              <div className="card-body pt-0" id="personnel-recent-activity-content">
                <ActivityList
                  items={analytics.recentActivity}
                  empty="No linked activity found yet for this person."
                />
              </div>
            ) : null}
          </section>
        </>
      )}

      {canManage ? (
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={personEditHref(person.id)}>
            <i className="bx bx-edit me-1" aria-hidden="true" />
            Edit full record
          </Link>
        </div>
      ) : null}
    </div>
  );
}
