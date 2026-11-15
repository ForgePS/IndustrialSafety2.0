"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGetResult, useAuth } from "@forge/web-kit";
import { FirstAidAddCertificationCard } from "@/components/first-aid-add-certification-card";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { PersonnelFirstAidSummaryCard } from "@/components/personnel-first-aid-summary-card";
import { personEditHref, personFileHref } from "@/lib/personnel-directory";
import {
  filterFirstAidPeople,
  firstAidExpiryBadgeClass,
  firstAidExpiryLabel,
  matchesFirstAidQuery,
  sortFirstAidPeople,
  toFirstAidPeople,
  type FirstAidExpiryStatus,
  type FirstAidFilter,
  type FirstAidPerson,
} from "@/lib/personnel-first-aid";

type ListResponse = {
  items?: unknown[];
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DASH = "—";

const FILTERS: Array<{ value: FirstAidFilter; label: string }> = [
  { value: "all", label: "All tracked" },
  { value: "cpr", label: "CPR on file" },
  { value: "first-aid", label: "First Aid on file" },
  { value: "expiring", label: "Expiring / expired (30 days)" },
];

function ExpiryCell({ date, status }: { date: string; status: FirstAidExpiryStatus }) {
  if (!date) return <span className="text-muted">{DASH}</span>;
  return (
    <div>
      <div>{date}</div>
      {status !== "none" && status !== "ok" ? (
        <span className={`badge ${firstAidExpiryBadgeClass(status)} mt-1`}>
          {firstAidExpiryLabel(status)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * First Aid module: Name, Department, CPR / First Aid expiration dates.
 * Sorted by location; 30-day expiration notifications via badges and summary.
 */
export function FirstAidDirectory({ moduleName = "First Aid" }: { moduleName?: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.first_aid.view") ||
    permissions.has("industrial.personnel.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canEdit =
    permissions.has("industrial.first_aid.manage") ||
    permissions.has("industrial.personnel.manage") ||
    permissions.has("industrial.admin");

  const [people, setPeople] = useState<FirstAidPerson[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FirstAidFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const loadRoster = useCallback(async () => {
    const all: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await apiGetResult<ListResponse>("/api/v1/industrial/personnel", {
        query: {
          page: String(page),
          pageSize: String(PAGE_SIZE),
          firstAidTracked: "true",
        },
      });
      const items = Array.isArray(result.data.items) ? result.data.items : [];
      all.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
    return toFirstAidPeople(all);
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
        const next = await loadRoster();
        if (!cancelled) setPeople(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load First Aid roster");
          setPeople([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, loadRoster, reloadToken]);

  const visible = useMemo(() => {
    const filtered = filterFirstAidPeople(
      people.filter((person) => matchesFirstAidQuery(person, query)),
      filter,
    );
    return sortFirstAidPeople(filtered);
  }, [people, query, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, FirstAidPerson[]>();
    for (const person of visible) {
      const key = person.locationLabel || "Unassigned location";
      const list = map.get(key) ?? [];
      list.push(person);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view First Aid certifications.
      </div>
    );
  }

  return (
    <>
      <ModuleWorkspaceHeader
        eyebrow="People & Training"
        title={moduleName}
        description="CPR and First Aid certification expiration dates from each personnel file. Add a certification below to link copies and dates to an employee, or edit from the personnel file. Sorted by location; renewals notify 30 days prior."
      />

      <PersonnelFirstAidSummaryCard enabled={canView} refreshKey={reloadToken} />

      <FirstAidAddCertificationCard
        canManage={canEdit}
        onAssigned={async () => {
          setReloadToken((n) => n + 1);
        }}
      />

      <form className="row g-2 mb-3" onSubmit={onSubmit}>
        <div className="col-lg-5">
          <div className="input-group">
            <span className="input-group-text">
              <i className="bx bx-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              className="form-control"
              placeholder="Search name, department, location…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              aria-label="Search First Aid roster"
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
          <select
            className="form-select"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value as FirstAidFilter)}
            aria-label="Filter First Aid roster"
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-4 col-lg-2 d-flex align-items-center">
          <span className="text-muted small">
            Showing {visible.length} of {people.length} people
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
          Loading First Aid roster…
        </p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">
            No personnel match this First Aid view. Use Add certification above, or set CPR / First
            Aid expiration dates on a personnel file.
          </div>
        </div>
      ) : (
        grouped.map(([location, rows]) => (
          <div className="card mb-3" key={location}>
            <div className="card-header d-flex align-items-center justify-content-between">
              <strong>{location}</strong>
              <span className="text-muted small">
                {rows.length} person{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Department</th>
                    <th scope="col">CPR certification expiration</th>
                    <th scope="col">First Aid certification expiration</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <Link href={personFileHref(person.id)}>
                          {person.displayName || "Unnamed"}
                        </Link>
                      </td>
                      <td>{person.departmentName || DASH}</td>
                      <td>
                        <ExpiryCell date={person.cprExpiresDate} status={person.cprExpiryStatus} />
                      </td>
                      <td>
                        <ExpiryCell
                          date={person.firstAidExpiresDate}
                          status={person.firstAidExpiryStatus}
                        />
                      </td>
                      <td>
                        {canEdit ? (
                          <Link
                            className="btn btn-sm btn-outline-primary"
                            href={personEditHref(person.id)}
                          >
                            Edit
                          </Link>
                        ) : (
                          <Link
                            className="btn btn-sm btn-outline-secondary"
                            href={personFileHref(person.id)}
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
