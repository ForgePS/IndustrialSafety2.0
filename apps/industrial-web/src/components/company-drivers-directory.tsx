"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGetResult, apiSend, useAuth } from "@forge/web-kit";
import { personFileHref } from "@/lib/personnel-directory";
import {
  COMPANY_DRIVER_SORT_OPTIONS,
  companyVehicleDriverStatusBadge,
  companyVehicleDriverStatusLabel,
  DEFAULT_COMPANY_DRIVER_SORT,
  driversInMvrSample,
  driversWithLicenseIssues,
  EMPTY_DRIVER_SUMMARY,
  fileCountLabel,
  licenseCopyLabel,
  licenseExpiryState,
  matchesCompanyDriverQuery,
  mvrReleaseLabel,
  sampleLabel,
  sortCompanyVehicleDrivers,
  toCompanyVehicleDrivers,
  toCompanyVehicleDriverSummary,
  type CompanyDriverSort,
  type CompanyVehicleDriver,
  type CompanyVehicleDriverSummary,
  type LicenseIssueKind,
} from "@/lib/company-vehicle-drivers";

type ListResponse = {
  items?: unknown[];
  summary?: unknown;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DASH = "—";

/**
 * Personnel → Company Drivers: the insurance / MVR roster from
 * industrial_fleet_drivers, matching the legacy company vehicle drivers panel.
 */
export function CompanyDriversDirectory() {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") ||
    permissions.has("industrial.fleet.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.personnel.manage") ||
    permissions.has("industrial.fleet.manage") ||
    permissions.has("industrial.admin");

  const [drivers, setDrivers] = useState<CompanyVehicleDriver[]>([]);
  const [summary, setSummary] = useState<CompanyVehicleDriverSummary>(EMPTY_DRIVER_SUMMARY);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CompanyDriverSort>(DEFAULT_COMPANY_DRIVER_SORT);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "on_insurance" | "pending_mvr" | "suspended" | "removed"
  >("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [licenseIssuesOpen, setLicenseIssuesOpen] = useState(false);
  const [licenseIssueFilter, setLicenseIssueFilter] = useState<LicenseIssueKind[] | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDrivers = useCallback(async () => {
    const all: unknown[] = [];
    let rawSummary: unknown = null;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await apiGetResult<ListResponse>("/api/v1/industrial/fleet/drivers", {
        query: { page: String(page), pageSize: String(PAGE_SIZE) },
      });
      const items = Array.isArray(result.data.items) ? result.data.items : [];
      all.push(...items);
      if (page === 1) rawSummary = result.data.summary;
      if (items.length < PAGE_SIZE) break;
    }
    setDrivers(toCompanyVehicleDrivers(all));
    setSummary(toCompanyVehicleDriverSummary(rawSummary));
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        await refreshDrivers();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load company drivers");
          setDrivers([]);
          setSummary(EMPTY_DRIVER_SUMMARY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, refreshDrivers]);

  const visible = useMemo(() => {
    const filtered = drivers.filter((driver) => {
      if (statusFilter !== "all" && driver.status.toLowerCase() !== statusFilter) return false;
      return matchesCompanyDriverQuery(driver, query);
    });
    return sortCompanyVehicleDrivers(filtered, sort);
  }, [drivers, query, statusFilter, sort]);

  const licenseIssues = useMemo(
    () => driversWithLicenseIssues(drivers, undefined, licenseIssueFilter ?? undefined),
    [drivers, licenseIssueFilter],
  );

  const calendarYear = new Date().getUTCFullYear();
  const sampleDrivers = useMemo(
    () => driversInMvrSample(drivers, summary.sampleYear),
    [drivers, summary.sampleYear],
  );

  const licenseIssueCount =
    summary.missingLicenseExpiry + summary.licenseExpired + summary.licenseExpiringSoon;

  function openLicenseIssues(kinds?: LicenseIssueKind[]) {
    setLicenseIssueFilter(kinds ?? null);
    setLicenseIssuesOpen(true);
  }

  async function startMvrSample(forceRedraw = false) {
    if (!canManage) return;
    setSampleBusy(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/fleet/drivers/mvr-sample/start", "POST", {
        year: calendarYear,
        forceRedraw,
      });
      await refreshDrivers();
      setSampleOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start MVR sample");
    } finally {
      setSampleBusy(false);
    }
  }

  async function completeMvrSample(driverId: string) {
    if (!canManage) return;
    setSampleBusy(true);
    setError(null);
    try {
      await apiSend(
        `/api/v1/industrial/fleet/drivers/${encodeURIComponent(driverId)}/mvr-sample/complete`,
        "POST",
        { auditedByName: "Auditor" },
      );
      await refreshDrivers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to mark MVR audit complete");
    } finally {
      setSampleBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  if (!canView) {
    return (
      <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-lock-alt fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">Company Drivers</h5>
          <p className="mb-0">You do not have permission to view company vehicle drivers.</p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="company-drivers-title">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <h4 className="mb-1" id="company-drivers-title">
            Company Drivers
          </h4>
          <p className="text-muted mb-0">
            Everyone approved to drive company vehicles for insurance. Each entry links to a
            personnel file. Run an initial MVR when adding someone, keep the license number and
            expiration current, and pull about 10% each year for recurring MVR checks.
          </p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2">
          <span className="badge bg-label-success">On insurance: {summary.onInsurance}</span>
          <span className="badge bg-label-warning">Pending MVR: {summary.pendingMvr}</span>
          {summary.missingLicenseExpiry > 0 ? (
            <button
              type="button"
              className="badge bg-label-info border-0"
              onClick={() => openLicenseIssues(["missing"])}
            >
              Missing license expiration: {summary.missingLicenseExpiry}
            </button>
          ) : null}
          {summary.licenseExpired > 0 ? (
            <button
              type="button"
              className="badge bg-label-danger border-0"
              onClick={() => openLicenseIssues(["expired"])}
            >
              License expired: {summary.licenseExpired}
            </button>
          ) : null}
          {summary.licenseExpiringSoon > 0 ? (
            <button
              type="button"
              className="badge bg-label-warning border-0"
              onClick={() => openLicenseIssues(["expiring"])}
            >
              License expiring (30d): {summary.licenseExpiringSoon}
            </button>
          ) : null}
          {summary.suspended > 0 ? (
            <span className="badge bg-label-danger">Suspended: {summary.suspended}</span>
          ) : null}
          {summary.removed > 0 ? (
            <span className="badge bg-label-secondary">Removed: {summary.removed}</span>
          ) : null}
          <span className="badge bg-label-secondary">Total: {summary.total}</span>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <button
                type="button"
                className="btn btn-link text-start text-body text-decoration-none p-0 w-100"
                onClick={() => {
                  if (licenseIssuesOpen && licenseIssueFilter === null) {
                    setLicenseIssuesOpen(false);
                  } else {
                    openLicenseIssues();
                  }
                }}
                aria-expanded={licenseIssuesOpen}
                aria-controls="license-issues-panel"
              >
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <h6 className="mb-1">
                      Driver&apos;s license &amp; expiration
                      {licenseIssueCount > 0 ? (
                        <span className="badge bg-label-danger ms-2">{licenseIssueCount}</span>
                      ) : null}
                    </h6>
                    <p className="text-muted mb-0 small">
                      {licenseIssueCount > 0
                        ? "Click to review missing, expired, and soon-to-expire licenses. Open a name to jump to that personnel file."
                        : "Keep the license number, state, and expiration on every driver. No follow-ups right now."}
                    </p>
                  </div>
                  <i
                    className={`bx fs-4 flex-shrink-0 ${licenseIssuesOpen ? "bx-chevron-up" : "bx-chevron-right"}`}
                    aria-hidden="true"
                  />
                </div>
              </button>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <span className="badge bg-label-secondary">
                  MVR on file: {summary.mvrOnFile}
                </span>
                <span className="badge bg-label-secondary">
                  Signed MVR release: {summary.mvrReleaseOnFile}
                </span>
              </div>
              {licenseIssuesOpen ? (
                <div
                  id="license-issues-panel"
                  className="mt-3 border-top pt-3"
                  role="region"
                  aria-label="License follow-ups"
                >
                  {licenseIssues.length === 0 ? (
                    <p className="text-muted small mb-0">No drivers match this license filter.</p>
                  ) : (
                    <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                      {licenseIssues.map(({ driver, kind, reason }) => {
                        const name = driver.personnelName || "Unnamed";
                        const badge =
                          kind === "expired"
                            ? "bg-label-danger"
                            : kind === "expiring"
                              ? "bg-label-warning"
                              : "bg-label-info";
                        const body = (
                          <>
                            <span className="fw-medium">{name}</span>
                            {driver.employeeNumber ? (
                              <span className="text-muted small ms-2">{driver.employeeNumber}</span>
                            ) : null}
                            <span className={`badge ${badge} ms-2`}>{reason}</span>
                          </>
                        );
                        return (
                          <li key={driver.id}>
                            {driver.personnelId ? (
                              <Link
                                className="d-inline-flex flex-wrap align-items-center text-decoration-none"
                                href={personFileHref(driver.personnelId)}
                              >
                                {body}
                              </Link>
                            ) : (
                              <span className="d-inline-flex flex-wrap align-items-center text-muted">
                                {body}
                                <span className="small ms-2">(no personnel file)</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                <button
                  type="button"
                  className="btn btn-link text-start text-body text-decoration-none p-0"
                  onClick={() => setSampleOpen((open) => !open)}
                  aria-expanded={sampleOpen}
                  aria-controls="mvr-sample-panel"
                >
                  <h6 className="mb-1">
                    Annual 10% MVR sample
                    {summary.sampleSelected > 0 ? (
                      <span className="badge bg-label-primary ms-2">{summary.sampleSelected}</span>
                    ) : null}
                  </h6>
                  <p className="text-muted mb-0 small">
                    Scheduled each year. Start anytime to draw ~10% of active drivers for audit.
                  </p>
                </button>
                <i
                  className={`bx fs-4 flex-shrink-0 ${sampleOpen ? "bx-chevron-up" : "bx-chevron-right"}`}
                  aria-hidden="true"
                />
              </div>
              {summary.sampleYear === null ? (
                <p className="text-muted mb-2 small">No annual sample has been drawn yet.</p>
              ) : (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  <span className="badge bg-label-secondary">Year {summary.sampleYear}</span>
                  <span className="badge bg-label-primary">
                    Selected: {summary.sampleSelected}
                  </span>
                  <span className="badge bg-label-success">
                    Audited: {summary.sampleCompleted}
                  </span>
                  <span className="badge bg-label-warning">
                    Outstanding: {Math.max(0, summary.sampleSelected - summary.sampleCompleted)}
                  </span>
                </div>
              )}
              {canManage ? (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={sampleBusy}
                    onClick={() => void startMvrSample(false)}
                  >
                    {summary.sampleYear === calendarYear
                      ? `Open ${calendarYear} sample`
                      : `Start ${calendarYear} sample`}
                  </button>
                  {summary.sampleYear === calendarYear ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={sampleBusy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Redraw the ${calendarYear} 10% sample? Completed audits for this year stay on personnel files.`,
                          )
                        ) {
                          void startMvrSample(true);
                        }
                      }}
                    >
                      Redraw sample
                    </button>
                  ) : null}
                </div>
              ) : null}
              {sampleOpen ? (
                <div
                  id="mvr-sample-panel"
                  className="border-top pt-3 mt-2"
                  role="region"
                  aria-label="Annual MVR sample list"
                >
                  {sampleDrivers.length === 0 ? (
                    <p className="text-muted small mb-0">
                      {canManage
                        ? "Start the annual sample to select about 10% of drivers for audit."
                        : "No sample has been started yet."}
                    </p>
                  ) : (
                    <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                      {sampleDrivers.map((driver) => {
                        const audited = Boolean(driver.sampleCompletedAt);
                        const name = driver.personnelName || "Unnamed";
                        return (
                          <li
                            key={driver.id}
                            className="d-flex flex-wrap align-items-center justify-content-between gap-2"
                          >
                            <div className="min-w-0">
                              {driver.personnelId ? (
                                <Link
                                  className="fw-medium text-decoration-none"
                                  href={personFileHref(driver.personnelId)}
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span className="fw-medium">{name}</span>
                              )}
                              {driver.employeeNumber ? (
                                <span className="text-muted small ms-2">{driver.employeeNumber}</span>
                              ) : null}
                              <span
                                className={`badge ms-2 ${audited ? "bg-label-success" : "bg-label-warning"}`}
                              >
                                {audited
                                  ? `Audited ${driver.sampleCompletedAt.slice(0, 10)}`
                                  : "Needs audit"}
                              </span>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                              {driver.personnelId ? (
                                <Link
                                  className="btn btn-sm btn-outline-primary"
                                  href={personFileHref(driver.personnelId)}
                                >
                                  Open file
                                </Link>
                              ) : null}
                              {canManage && !audited ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-success"
                                  disabled={sampleBusy}
                                  onClick={() => void completeMvrSample(driver.id)}
                                >
                                  Mark audited
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <form className="row g-2 mb-3" onSubmit={onSubmit}>
        <div className="col-lg-5">
          <div className="input-group">
            <span className="input-group-text">
              <i className="bx bx-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              className="form-control"
              placeholder="Search name, employee #, license…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              aria-label="Search company drivers"
              autoComplete="off"
            />
            {query ? (
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="col-md-4 col-lg-3">
          <div className="input-group">
            <label className="input-group-text" htmlFor="company-drivers-sort">
              <i className="bx bx-sort-a-z me-1" aria-hidden="true" />
              Sort
            </label>
            <select
              id="company-drivers-sort"
              className="form-select"
              value={sort}
              onChange={(ev) => setSort(ev.target.value as CompanyDriverSort)}
              aria-label="Sort company drivers"
            >
              {COMPANY_DRIVER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="col-md-4 col-lg-2">
          <select
            className="form-select"
            value={statusFilter}
            onChange={(ev) => setStatusFilter(ev.target.value as typeof statusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="on_insurance">On insurance</option>
            <option value="pending_mvr">Pending MVR</option>
            <option value="suspended">Suspended</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        <div className="col-md-4 col-lg-2 d-flex align-items-center">
          <span className="text-muted small">
            Showing {visible.length} of {drivers.length} drivers
          </span>
        </div>
      </form>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status">
          Loading company drivers…
        </p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">No drivers match this view.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Emp #</th>
                  <th scope="col">License</th>
                  <th scope="col">License exp.</th>
                  <th scope="col">DL copy</th>
                  <th scope="col">Status</th>
                  <th scope="col">Initial MVR</th>
                  <th scope="col">MVR release</th>
                  <th scope="col">MVR files</th>
                  <th scope="col">Sample</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((driver) => {
                  const expiry = licenseExpiryState(driver);
                  const isOpen = expanded === driver.id;
                  return (
                    <Fragment key={driver.id}>
                      <tr>
                        <td>
                          {driver.personnelId ? (
                            <Link href={personFileHref(driver.personnelId)}>
                              {driver.personnelName || "Unnamed"}
                            </Link>
                          ) : (
                            <span>{driver.personnelName || "Unnamed"}</span>
                          )}
                          {expiry === "expired" ? (
                            <div className="text-danger small">License expired</div>
                          ) : expiry === "expiring" ? (
                            <div className="text-warning small">License expiring soon</div>
                          ) : null}
                        </td>
                        <td>{driver.employeeNumber || DASH}</td>
                        <td>
                          {driver.licenseNumber
                            ? `${driver.licenseNumber}${driver.licenseState ? ` / ${driver.licenseState}` : ""}`
                            : DASH}
                        </td>
                        <td>
                          {driver.licenseExpiryDate ? (
                            <span
                              className={
                                expiry === "expired"
                                  ? "text-danger fw-semibold"
                                  : expiry === "expiring"
                                    ? "text-warning fw-semibold"
                                    : undefined
                              }
                            >
                              {driver.licenseExpiryDate}
                            </span>
                          ) : (
                            <span className="text-muted">Missing</span>
                          )}
                        </td>
                        <td>{licenseCopyLabel(driver) || DASH}</td>
                        <td>
                          <span className={`badge ${companyVehicleDriverStatusBadge(driver.status)}`}>
                            {companyVehicleDriverStatusLabel(driver.status)}
                          </span>
                        </td>
                        <td>{driver.initialMvrDate || DASH}</td>
                        <td>{mvrReleaseLabel(driver) || DASH}</td>
                        <td>{fileCountLabel(driver.mvrUploadCount) || DASH}</td>
                        <td>{sampleLabel(driver, summary.sampleYear) || DASH}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-2">
                            {driver.personnelId ? (
                              <Link
                                className="btn btn-sm btn-outline-primary"
                                href={personFileHref(driver.personnelId)}
                              >
                                File
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setExpanded(isOpen ? null : driver.id)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? "Hide details" : "Details"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr>
                          <td colSpan={11} className="bg-lighter">
                            <div className="row g-3 py-2">
                              <DetailCell label="Date of birth" value={driver.dateOfBirth} />
                              <DetailCell
                                label="On insurance since"
                                value={driver.insuranceEffectiveDate}
                              />
                              <DetailCell
                                label="Removed from insurance"
                                value={driver.insuranceRemovedDate}
                              />
                              <DetailCell label="Last MVR" value={driver.lastMvrDate} />
                              <DetailCell label="Next MVR due" value={driver.nextMvrDueDate} />
                              <DetailCell
                                label="Last MVR upload"
                                value={driver.lastMvrUploadAt.slice(0, 10)}
                              />
                              <DetailCell
                                label="MVR release files"
                                value={fileCountLabel(driver.mvrReleaseUploadCount)}
                              />
                              <DetailCell
                                label="Sample selected"
                                value={driver.sampleSelectedAt.slice(0, 10)}
                              />
                              {driver.notes ? (
                                <div className="col-12">
                                  <div className="text-muted small">Notes</div>
                                  <div>{driver.notes}</div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-6 col-md-3">
      <div className="text-muted small">{label}</div>
      <div>{value || DASH}</div>
    </div>
  );
}
