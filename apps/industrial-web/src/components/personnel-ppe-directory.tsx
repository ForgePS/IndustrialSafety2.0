"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGetResult, useAuth } from "@forge/web-kit";
import { PersonnelPpeSummaryCard } from "@/components/personnel-ppe-summary-card";
import { personEditHref, personFileHref } from "@/lib/personnel-directory";
import { safetyFootwearClassLabel } from "@/lib/personnel-form";
import {
  filterPpeAllowancePeople,
  formatPpeExtraPairSummary,
  matchesPpeAllowanceQuery,
  ppeExpiryBadgeClass,
  ppeExpiryLabel,
  ppeExtraPairHasInfo,
  sortPpeAllowancePeople,
  toPpeAllowancePeople,
  type PpeAllowanceFilter,
  type PpeAllowancePerson,
  type PpeExpiryStatus,
  type PpeExtraPairApproval,
} from "@/lib/personnel-ppe";

type ListResponse = {
  items?: unknown[];
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DASH = "—";

const FILTERS: Array<{ value: PpeAllowanceFilter; label: string }> = [
  { value: "all", label: "All tracked" },
  { value: "glasses", label: "Prescription glasses" },
  { value: "footwear", label: "Safety boots" },
  { value: "expiring", label: "Expiring / expired" },
  { value: "extra-pair", label: "Extra-pair approvals" },
];

function DateCell({
  issued,
  expires,
  status,
}: {
  issued: string;
  expires: string;
  status: PpeExpiryStatus;
}) {
  if (!issued && !expires) return <span className="text-muted">{DASH}</span>;
  return (
    <div>
      <div>
        <small className="text-muted">Issued</small> {issued || DASH}
      </div>
      <div>
        <small className="text-muted">Expires</small> {expires || DASH}
      </div>
      {status !== "none" && status !== "ok" ? (
        <span className={`badge ${ppeExpiryBadgeClass(status)} mt-1`}>{ppeExpiryLabel(status)}</span>
      ) : null}
    </div>
  );
}

function ExtraPairCell({ approval }: { approval: PpeExtraPairApproval }) {
  if (!ppeExtraPairHasInfo(approval)) {
    return <span className="text-muted">{DASH}</span>;
  }
  return (
    <div>
      <div>{formatPpeExtraPairSummary(approval)}</div>
    </div>
  );
}

/**
 * Personnel → PPE Allowance: glasses and safety boots with issued/expiry dates
 * and manager extra-pair approvals.
 */
export function PersonnelPpeDirectory() {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");

  const [people, setPeople] = useState<PpeAllowancePerson[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PpeAllowanceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const all: unknown[] = [];
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const result = await apiGetResult<ListResponse>("/api/v1/industrial/personnel", {
            query: {
              page: String(page),
              pageSize: String(PAGE_SIZE),
              ppeTracked: "true",
            },
          });
          const items = Array.isArray(result.data.items) ? result.data.items : [];
          all.push(...items);
          if (items.length < PAGE_SIZE) break;
        }
        if (!cancelled) setPeople(toPpeAllowancePeople(all));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load PPE allowances");
          setPeople([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const visible = useMemo(() => {
    const filtered = filterPpeAllowancePeople(
      people.filter((person) => matchesPpeAllowanceQuery(person, query)),
      filter,
    );
    return sortPpeAllowancePeople(filtered);
  }, [people, query, filter]);

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view PPE allowances.
      </div>
    );
  }

  return (
    <>
      <PersonnelPpeSummaryCard enabled={canView} />

      <form className="row g-2 mb-3" onSubmit={onSubmit}>
        <div className="col-lg-5">
          <div className="input-group">
            <span className="input-group-text">
              <i className="bx bx-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              className="form-control"
              placeholder="Search name, employee #, approver…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              aria-label="Search PPE allowances"
              autoComplete="off"
            />
            {query ? (
              <button className="btn btn-outline-secondary" type="button" onClick={() => setQuery("")}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="col-md-4 col-lg-3">
          <select
            className="form-select"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value as PpeAllowanceFilter)}
            aria-label="Filter PPE allowances"
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
          Loading PPE allowances…
        </p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">
            No personnel match this PPE allowance view.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Emp #</th>
                  <th scope="col">Prescription safety glasses</th>
                  <th scope="col">Glasses extra pair</th>
                  <th scope="col">Safety boots</th>
                  <th scope="col">Boots extra pair</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <Link href={personFileHref(person.id)}>{person.displayName || "Unnamed"}</Link>
                    </td>
                    <td>{person.employeeNumber || DASH}</td>
                    <td>
                      {person.tracksGlasses ? (
                        <DateCell
                          issued={person.glassesIssuedDate}
                          expires={person.glassesExpiresDate}
                          status={person.glassesExpiryStatus}
                        />
                      ) : (
                        <span className="text-muted">Not tracked</span>
                      )}
                    </td>
                    <td>
                      {person.tracksGlasses ? (
                        <ExtraPairCell approval={person.glassesExtra} />
                      ) : (
                        <span className="text-muted">{DASH}</span>
                      )}
                    </td>
                    <td>
                      {person.footwearClass ? (
                        <>
                          <div className="fw-medium">
                            {safetyFootwearClassLabel(person.footwearClass) || person.footwearClass}
                          </div>
                          <DateCell
                            issued={person.footwearIssuedDate}
                            expires={person.footwearExpiresDate}
                            status={person.footwearExpiryStatus}
                          />
                        </>
                      ) : (
                        <span className="text-muted">Not tracked</span>
                      )}
                    </td>
                    <td>
                      {person.footwearClass ? (
                        <ExtraPairCell approval={person.footwearExtra} />
                      ) : (
                        <span className="text-muted">{DASH}</span>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-sm btn-outline-primary" href={personEditHref(person.id)}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
