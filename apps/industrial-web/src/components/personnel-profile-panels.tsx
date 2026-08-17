"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import {
  buildProfileMetrics,
  completedPersonnelForms,
  emptyPersonnelProfileAnalytics,
  itemsForSection,
  moduleListHref,
  sectionTitle,
  type PersonnelProfileAnalytics,
  type ProfileActivityItem,
  type ProfileMetric,
  type ProfileSectionId,
} from "@/lib/personnel-profile-analytics";
import {
  rosterInitials,
  statusBadgeClass,
  personEditHref,
  type RosterPerson,
} from "@/lib/personnel-directory";
import { formatFileDate, stripImportNotes } from "@/lib/personnel-file";

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
        <Link
          key={item.id}
          href={item.href}
          className="list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-3 px-0"
        >
          <div className="min-w-0">
            <span className="d-block text-truncate fw-medium">{item.label}</span>
            <small className="text-muted">
              {item.module}
              {item.status ? ` · ${item.status}` : ""}
            </small>
          </div>
          <small className="text-muted text-nowrap">{item.date.slice(0, 10)}</small>
        </Link>
      ))}
    </div>
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<PersonnelProfileAnalytics>(
          `/api/v1/industrial/personnel/${encodeURIComponent(person.id)}/analytics`,
        );
        if (!cancelled) setAnalytics(data);
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
  }, [person.id]);

  const searchHint =
    person.employeeNumber || person.displayName || (analytics as { searchHint?: string }).searchHint || "";
  const metrics = buildProfileMetrics(analytics, searchHint);
  const completedForms = completedPersonnelForms(analytics);
  const place =
    siteLabel ||
    (typeof record.site === "string" ? record.site : "") ||
    person.siteLabel ||
    person.departmentName ||
    "No org unit assigned";

  const middle =
    (typeof record.middleName === "string" && record.middleName.trim()) ||
    (typeof record.middleInitial === "string" && record.middleInitial.trim()) ||
    "—";
  const suffix = (typeof record.suffix === "string" && record.suffix.trim()) || "—";
  const email = person.email || "—";
  const phone =
    (typeof record.phone === "string" && record.phone.trim()) ||
    (typeof record.companyPhone === "string" && record.companyPhone.trim()) ||
    "—";
  const hireDate = shortDate(record.hireDate);
  const notes = stripImportNotes(typeof record.notes === "string" ? record.notes : "");
  const preferred =
    (typeof record.preferredName === "string" && record.preferredName.trim()) ||
    (typeof record.goesBy === "string" && record.goesBy.trim()) ||
    "";

  function openSection(section: ProfileSectionId) {
    setActiveSection((prev) => (prev === section ? null : section));
  }

  const sectionItems = activeSection ? itemsForSection(analytics, activeSection) : [];

  return (
    <div className="ind-personnel-profile">
      <section className="card mb-4">
        <div className="card-header d-flex flex-wrap align-items-start gap-3">
          <div className="avatar avatar-lg flex-shrink-0">
            <span className="avatar-initial rounded bg-label-primary">
              {rosterInitials(person.displayName)}
            </span>
          </div>
          <div className="flex-grow-1 min-w-0">
            <h5 className="mb-1">{person.displayName}</h5>
            {preferred ? (
              <p className="text-muted small mb-1">Goes by &ldquo;{preferred}&rdquo;</p>
            ) : null}
            <p className="text-muted mb-1">
              {person.jobTitle || "Team member"}
              {person.employeeNumber ? ` · ${person.employeeNumber}` : ""}
            </p>
            <p className="text-muted mb-0">{place}</p>
          </div>
          <div className="text-center border rounded px-3 py-2">
            <small className="text-muted text-uppercase d-block">Safety score</small>
            <span className="fs-4 fw-bold">{loading ? "…" : analytics.safetyScore}</span>
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
              <DetailRow
                label="Company driver"
                value={person.isCompanyDriver ? "Yes — on roster" : "No"}
              />
            </div>
            <div className="col-6 col-md-4 col-lg">
              <DetailRow label="Hire date" value={hireDate} />
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
                      <dt className="text-muted fw-normal">As injured/reported employee</dt>
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

          <section className="card mb-4">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
              onClick={() => openSection("activity")}
            >
              <h5 className="card-title mb-0">Recent activity</h5>
              <i className="bx bx-chevron-right" aria-hidden="true" />
            </button>
            <div className="card-body pt-0">
              <ActivityList
                items={analytics.recentActivity}
                empty="No linked activity found yet for this person."
              />
            </div>
          </section>

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
              </div>
            ) : null}
          </section>

          <section className="card mb-4">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
              onClick={() => openSection("attached-forms")}
            >
              <h5 className="card-title mb-0">Attached forms</h5>
              <i className="bx bx-chevron-right" aria-hidden="true" />
            </button>
            <div className="card-body pt-0">
              <ActivityList
                items={analytics.forms.submissions}
                empty="No forms have been submitted for this profile yet."
              />
            </div>
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
