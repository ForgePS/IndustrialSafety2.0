"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiGetResult, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { matchesFacilitySelection } from "@/lib/industrial-facility";
import { OPS_MODULE_CONFIG } from "@/lib/ops-modules";
import { normalizeLookupRows, type LookupOption } from "@/lib/personnel-lookups";
import {
  DEFAULT_ROSTER_SORT,
  matchesRosterQuery,
  personFileHref,
  ROSTER_SORT_OPTIONS,
  rosterInitials,
  rosterMeta,
  rosterSubtitle,
  sortRosterPeople,
  statusBadgeClass,
  toRosterPeople,
  type RosterPerson,
  type RosterSort,
} from "@/lib/personnel-directory";
import {
  personnelDirectoryTitle,
  personnelListQueryForView,
  type PersonnelQuickView,
} from "@/lib/personnel-quick-nav";

/** Rows per API request. The list endpoint caps page size at 100. */
const FETCH_SIZE = 100;
/** Safety net so a runaway total can never spin the browser. */
const MAX_FETCH_PAGES = 40;
/** Cards rendered before "Load more"; the whole roster is already in memory. */
const RENDER_STEP = 48;

type ListResponse = { items?: unknown[]; page?: number; pageSize?: number };

type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

/**
 * Roster as a card grid (four across on wide screens), mirroring the directory
 * the crews used before the AWS cutover. Every card is a link into that
 * person's personnel file rather than a row with a single hit target.
 */
export function PersonnelDirectory({
  moduleName,
  view = "dashboard",
}: {
  moduleName: string;
  view?: PersonnelQuickView;
}) {
  const cfg = OPS_MODULE_CONFIG.personnel;
  const { me } = useAuth();
  const { facilityId, facilities, query: facilityQuery } = useIndustrialFacility();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has(cfg.viewPerm) || permissions.has("industrial.admin");
  const canManage = permissions.has(cfg.managePerm) || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [people, setPeople] = useState<RosterPerson[]>([]);
  const [sites, setSites] = useState<LookupOption[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT);
  const [rosterTotal, setRosterTotal] = useState(0);
  /** Sticky: set when a roster is too big to hold client-side, so search has to go to the API. */
  const [serverSearch, setServerSearch] = useState(false);
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const modEntry = bootstrap?.modules.find((m) => m.code === cfg.code);
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load module bootstrap");
          setBootstrap({ industrialEnabled: false, modules: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!awsReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<unknown>("/api/v1/industrial/sites", {
          query: { page: "1", pageSize: "200" },
        });
        if (!cancelled) setSites(normalizeLookupRows(data));
      } catch {
        // Site names are decoration on the card; the department fallback covers it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady]);

  /**
   * The roster runs to four figures, so pull every page up front. Sorting and
   * searching happen across the whole list; a partial page would put the wrong
   * people under "A" and undercount the directory.
   */
  const fetchRoster = useCallback(
    async (q: string, order: RosterSort): Promise<{ people: RosterPerson[]; total: number }> => {
      const rows: unknown[] = [];
      let total = 0;
      for (let page = 1; page <= MAX_FETCH_PAGES; page += 1) {
        const result = await apiGetResult<ListResponse>(cfg.listPath, {
          query: {
            q: q || undefined,
            sort: order,
            page: String(page),
            pageSize: String(FETCH_SIZE),
            ...personnelListQueryForView(view),
            ...facilityQuery,
          },
        });
        const items = Array.isArray(result.data.items) ? result.data.items : [];
        rows.push(...items);
        total = Math.max(result.meta?.pagination?.total ?? 0, rows.length);
        // A short page is the only reliable end-of-roster signal: an API that
        // reports total as the page length would otherwise stop us at page one.
        if (items.length < FETCH_SIZE) break;
      }
      return { people: toRosterPeople(rows), total };
    },
    [cfg.listPath, facilityQuery, view],
  );

  useEffect(() => {
    if (!awsReady) {
      if (bootstrap) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const roster = await fetchRoster(search, sort);
        if (!cancelled) {
          setPeople(roster.people);
          setRosterTotal(roster.total);
          setRenderLimit(RENDER_STEP);
          if (roster.total > roster.people.length) setServerSearch(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load personnel");
          setPeople([]);
          setRosterTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, bootstrap, fetchRoster, search, sort]);

  const siteNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites) map.set(site.id, site.label);
    return map;
  }, [sites]);

  /**
   * Word-start matching first, so "don" lands on DON BAITY rather than every
   * BRANDON. Only when that finds nobody do we widen to matches inside words.
   */
  const { visible, widened } = useMemo(() => {
    const scoped = people.filter((p) => matchesFacilitySelection(p, facilityId, facilities));
    const strict = scoped.filter((p) => matchesRosterQuery(p, query, siteNames.get(p.siteId)));
    if (strict.length > 0 || query.trim() === "") {
      return { visible: sortRosterPeople(strict, sort), widened: false };
    }
    const loose = scoped.filter((p) => matchesRosterQuery(p, query, siteNames.get(p.siteId), true));
    return { visible: sortRosterPeople(loose, sort), widened: loose.length > 0 };
  }, [facilities, facilityId, people, query, siteNames, sort]);

  const shown = useMemo(() => visible.slice(0, renderLimit), [visible, renderLimit]);

  /**
   * Filtering is instant against the loaded roster. Only when the roster did
   * not fit in memory does the query also go to the API, debounced, so matches
   * beyond the fetch cap still turn up.
   */
  useEffect(() => {
    if (!serverSearch) return;
    const timer = window.setTimeout(() => setSearch(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query, serverSearch]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  if (!canView) {
    return (
      <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-lock-alt fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">{moduleName}</h5>
          <p className="mb-0">
            You do not have permission to view this module. Missing{" "}
            <code>{cfg.viewPerm}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (bootstrap && !awsReady) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  return (
    <section aria-labelledby="personnel-directory-title">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <h4 className="mb-1" id="personnel-directory-title">
            {personnelDirectoryTitle(view)}
          </h4>
          <p className="text-muted mb-0">
            {loading
              ? "Loading roster…"
              : shown.length < visible.length
                ? `Showing ${shown.length} of ${visible.length} people`
                : `${visible.length} ${visible.length === 1 ? "person" : "people"}`}
          </p>
          {!loading && widened ? (
            <p className="text-muted small mb-0">
              No names start with &ldquo;{query.trim()}&rdquo; — showing partial matches.
            </p>
          ) : null}
          {!loading && rosterTotal > people.length ? (
            <p className="text-muted small mb-0">
              Roster capped at {people.length} of {rosterTotal} records for this view.
            </p>
          ) : null}
        </div>
        {canManage && cfg.createHref ? (
          <Link className="btn btn-primary" href={cfg.createHref}>
            <i className="bx bx-user-plus me-1" aria-hidden="true" />
            Add person
          </Link>
        ) : null}
      </div>

      <form className="card mb-4" onSubmit={onSubmit} role="search">
        <div className="card-body py-3">
          <div className="row g-2 align-items-center">
            <div className="col-lg">
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bx bx-search" aria-hidden="true" />
                </span>
                <input
                  id="personnel-directory-search"
                  type="search"
                  className="form-control"
                  placeholder="Search by name, employee number, title, department, or email"
                  aria-label="Search personnel"
                  autoComplete="off"
                  value={query}
                  onChange={(ev) => {
                    setQuery(ev.target.value);
                    setRenderLimit(RENDER_STEP);
                  }}
                />
                {query ? (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setRenderLimit(RENDER_STEP);
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div className="col-lg-auto">
              <div className="input-group">
                <label className="input-group-text" htmlFor="personnel-directory-sort">
                  <i className="bx bx-sort-a-z me-1" aria-hidden="true" />
                  Sort
                </label>
                <select
                  id="personnel-directory-sort"
                  className="form-select"
                  value={sort}
                  onChange={(ev) => setSort(ev.target.value as RosterSort)}
                >
                  {ROSTER_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </form>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status" aria-live="polite">
          Loading personnel…
        </p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-5">
            <i className="bx bx-user-x display-6 text-muted d-block mb-2" aria-hidden="true" />
            <h6 className="mb-1">No personnel match this view</h6>
            <p className="text-muted mb-0">
              {search || query
                ? "Try a different search term."
                : view === "company-drivers"
                  ? "No company drivers are marked on the roster yet."
                  : view === "archived"
                    ? "No archived personnel for this tenant."
                    : "Add a person to start building the roster."}
            </p>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {shown.map((person) => {
            const siteName = siteNames.get(person.siteId);
            const meta = rosterMeta(person, siteName);
            return (
              <div className="col-sm-6 col-lg-4 col-xl-3" key={person.id}>
                <Link
                  href={personFileHref(person.id)}
                  className="card h-100 ind-person-card text-body text-decoration-none"
                >
                  <div className="card-body">
                    <div className="d-flex align-items-start gap-3">
                      <div className="avatar flex-shrink-0">
                        <span className="avatar-initial rounded bg-label-primary">
                          {rosterInitials(person.displayName)}
                        </span>
                      </div>
                      <div className="flex-grow-1 min-w-0">
                        <h6 className="mb-0 text-truncate" title={person.displayName}>
                          {person.displayName}
                        </h6>
                        <small className="text-muted d-block text-truncate">
                          {rosterSubtitle(person)}
                        </small>
                        {meta ? (
                          <small className="text-muted d-block text-truncate">{meta}</small>
                        ) : null}
                      </div>
                    </div>
                    <div className="d-flex align-items-center justify-content-between gap-2 mt-3">
                      <div className="d-flex flex-wrap gap-1">
                        {person.status ? (
                          <span className={`badge ${statusBadgeClass(person.status)}`}>
                            {person.status}
                          </span>
                        ) : null}
                        {person.isCompanyDriver ? (
                          <span className="badge bg-label-info">Company driver</span>
                        ) : null}
                        {person.hasPpeExpiryAlert ? (
                          <span className="badge bg-warning text-dark">PPE renewal</span>
                        ) : null}
                      </div>
                      <span className="small text-primary text-nowrap">
                        View profile
                        <i className="bx bx-chevron-right align-middle" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {!loading && shown.length < visible.length ? (
        <div className="d-flex justify-content-center gap-2 mt-4">
          <button
            className="btn btn-outline-primary"
            type="button"
            onClick={() => setRenderLimit((limit) => limit + RENDER_STEP)}
          >
            Load more
          </button>
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => setRenderLimit(visible.length)}
          >
            Show all {visible.length}
          </button>
        </div>
      ) : null}
    </section>
  );
}
