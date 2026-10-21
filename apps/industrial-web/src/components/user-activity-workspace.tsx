"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { AdminSectionCard } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  canAccessUserActivity,
  filterUserActivityRows,
  formatActivityRelative,
  formatActivityTimestamp,
  formatAuditActionLabel,
  sortUserActivityRows,
  toUserActivityRow,
  activityByUserId,
  type UserActivityRow,
} from "@/lib/user-activity";
import {
  canReadAuditLog,
  formatAdminDate,
  listAuditEvents,
  type AuditEventRow,
} from "@/lib/platform-admin";
import {
  toDirectoryUsers,
  type PlatformMembershipRow,
  type PlatformUserRow,
} from "@/lib/user-management";

type MembershipHistoryRow = {
  id?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  changedAt?: string | null;
  createdAt?: string | null;
};

function statusBadge(status: string): string {
  const key = status.toUpperCase();
  if (key === "ACTIVE") return "bg-label-success";
  if (key === "PENDING" || key === "INVITED") return "bg-label-warning";
  if (key === "SUSPENDED" || key === "REVOKED" || key === "DISABLED") return "bg-label-danger";
  return "bg-label-secondary";
}

function riskBadge(level: string): string {
  const key = level.toUpperCase();
  if (key === "HIGH" || key === "CRITICAL") return "bg-label-danger";
  if (key === "MEDIUM") return "bg-label-warning";
  if (key === "LOW") return "bg-label-info";
  return "bg-label-secondary";
}

export function UserActivityWorkspace() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canAccessUserActivity(me);
  const canAudit = canReadAuditLog(me);

  const [rows, setRows] = useState<UserActivityRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [selected, setSelected] = useState<UserActivityRow | null>(null);
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [history, setHistory] = useState<MembershipHistoryRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const [memberships, platformUsers] = await Promise.all([
        apiGet<PlatformMembershipRow[]>(`/api/v1/tenants/${tenantId}/memberships`),
        apiGet<PlatformUserRow[]>(`/api/v1/tenants/${tenantId}/users`).catch(() => []),
      ]);
      const activityMap = activityByUserId(memberships);
      const directory = toDirectoryUsers(memberships, platformUsers);
      const next = sortUserActivityRows(
        directory.map((user) => {
          const activity = activityMap.get(user.userId);
          return toUserActivityRow(
            {
              ...user,
              lastLoginAt: activity?.lastLoginAt ?? user.lastLoginAt,
            },
            activity?.lastActivityAt ?? null,
          );
        }),
      );
      setRows(next);
      setNowMs(Date.now());
      setSelected((prev) =>
        prev ? (next.find((row) => row.userId === prev.userId) ?? null) : null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load user activity");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canAccess]);

  const loadDetail = useCallback(
    async (user: UserActivityRow) => {
      if (!tenantId) return;
      setDetailLoading(true);
      setDetailError(null);
      setEvents([]);
      setEventsTotal(0);
      setHistory([]);
      try {
        const tasks: Array<Promise<void>> = [];

        if (canAudit) {
          tasks.push(
            (async () => {
              const result = await listAuditEvents(tenantId, {
                page: 1,
                pageSize: 50,
                actorUserId: user.userId,
              });
              setEvents(result.events);
              setEventsTotal(result.total);
            })(),
          );
        }

        tasks.push(
          (async () => {
            try {
              const rows = await apiGet<MembershipHistoryRow[]>(
                `/api/v1/tenants/${tenantId}/memberships/${encodeURIComponent(user.membershipId)}/history`,
              );
              setHistory(Array.isArray(rows) ? rows : []);
            } catch {
              setHistory([]);
            }
          })(),
        );

        await Promise.all(tasks);
      } catch (err) {
        setDetailError(
          err instanceof ApiError ? err.message : "Failed to load this user's activity",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId, canAudit],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadDetail(selected);
  }, [selected, loadDetail]);

  const filtered = useMemo(() => filterUserActivityRows(rows, query), [rows, query]);
  const onlineCount = useMemo(
    () => filtered.filter((row) => row.online || isFresh(row.lastActivityAt, nowMs)).length,
    [filtered, nowMs],
  );

  if (authLoading) {
    return <p className="text-muted mb-0">Loading user activity…</p>;
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">User activity</h4>
        <p className="mb-0">
          This section is limited to Admin, Super Admin, and Creator. Ask a tenant admin if you
          need access.
        </p>
      </div>
    );
  }

  return (
    <>
      <ModuleWorkspaceHeader
        title="User activity"
        description="Track when users last signed in and review what they changed on the Platform."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <div className="text-muted small text-uppercase">Currently online</div>
            <div className="fs-4 fw-semibold mb-0">{onlineCount}</div>
          </div>
          <div>
            <div className="text-muted small text-uppercase">Users shown</div>
            <div className="fs-4 fw-semibold mb-0">{filtered.length}</div>
          </div>
          <div className="flex-grow-1" style={{ minWidth: "14rem", maxWidth: "22rem" }}>
            <label className="form-label visually-hidden" htmlFor="user-activity-search">
              Search users
            </label>
            <input
              id="user-activity-search"
              type="search"
              className="form-control"
              placeholder="Search by name, email, or role"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
            />
          </div>
        </div>
      </div>

      {selected ? (
        <div className="card mb-3 border-primary" id="user-activity-detail">
          <div className="card-header d-flex flex-wrap align-items-start justify-content-between gap-2">
            <div className="min-w-0">
              <h5 className="card-title mb-1">{selected.displayName}</h5>
              <div className="small text-muted">{selected.email || "No email"}</div>
              {selected.roles.length > 0 ? (
                <div className="small text-muted">{selected.roles.join(", ")}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <div className="col-sm-4">
                <div className="text-muted small text-uppercase">Last login</div>
                <div>{formatActivityTimestamp(selected.lastLoginAt)}</div>
                <div className="small text-muted">
                  {formatActivityRelative(selected.lastLoginAt, nowMs)}
                </div>
              </div>
              <div className="col-sm-4">
                <div className="text-muted small text-uppercase">Last activity</div>
                <div>{formatActivityTimestamp(selected.lastActivityAt)}</div>
                <div className="small text-muted">
                  {formatActivityRelative(selected.lastActivityAt, nowMs)}
                </div>
              </div>
              <div className="col-sm-4">
                <div className="text-muted small text-uppercase">Membership</div>
                <span className={`badge ${statusBadge(selected.membershipStatus)}`}>
                  {selected.membershipStatus || "—"}
                </span>
              </div>
            </div>

            {detailError ? (
              <div className="alert alert-danger py-2" role="alert">
                {detailError}
              </div>
            ) : null}

            <h6 className="mb-2">Recorded actions</h6>
            {!canAudit ? (
              <p className="text-muted small mb-3">
                Audit read permission is required to see this user&apos;s platform actions. Last
                login and activity times are still shown above.
              </p>
            ) : detailLoading ? (
              <p className="text-muted small mb-3">Loading actions…</p>
            ) : events.length === 0 ? (
              <p className="text-muted small mb-3">
                No audited actions recorded for this user yet. Sign-ins and routine browsing are
                not written to the audit log.
              </p>
            ) : (
              <div className="table-responsive mb-3">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Action</th>
                      <th scope="col">Resource</th>
                      <th scope="col">Result</th>
                      <th scope="col">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td className="text-nowrap small">
                          {formatAdminDate(event.occurredAt)}
                        </td>
                        <td>
                          <div className="fw-medium">{formatAuditActionLabel(event.action)}</div>
                          <div className="small text-muted">{event.action}</div>
                        </td>
                        <td className="small">
                          <div>{event.resourceType || "—"}</div>
                          {event.resourceId ? (
                            <div className="text-muted text-truncate" style={{ maxWidth: "12rem" }}>
                              {event.resourceId}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="badge bg-label-secondary">{event.result || "—"}</span>
                        </td>
                        <td>
                          <span className={`badge ${riskBadge(event.riskLevel)}`}>
                            {event.riskLevel || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {eventsTotal > events.length ? (
                  <p className="small text-muted mt-2 mb-0">
                    Showing {events.length} of {eventsTotal} events.{" "}
                    <Link href="/settings/audit/">Open full audit log</Link>
                  </p>
                ) : (
                  <p className="small text-muted mt-2 mb-0">
                    <Link href="/settings/audit/">Open full audit log</Link>
                  </p>
                )}
              </div>
            )}

            <h6 className="mb-2">Access changes</h6>
            {detailLoading ? (
              <p className="text-muted small mb-0">Loading access history…</p>
            ) : history.length === 0 ? (
              <p className="text-muted small mb-0">No membership status changes recorded.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {history.map((item, index) => {
                  const when = item.changedAt || item.createdAt || null;
                  return (
                    <li key={item.id || `${index}-${when}`} className="small mb-2">
                      <span className="fw-medium">
                        {item.fromStatus || "—"} → {item.toStatus || "—"}
                      </span>
                      <span className="text-muted">
                        {" "}
                        · {when ? formatAdminDate(when) : "Unknown time"}
                      </span>
                      {item.reason ? <div className="text-muted">{item.reason}</div> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Status</th>
                <th scope="col">Last login</th>
                <th scope="col">Last activity</th>
                <th scope="col">Presence</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Loading activity…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    No users match this search.
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const online = row.online || isFresh(row.lastActivityAt, nowMs);
                const isSelected = selected?.userId === row.userId;
                return (
                  <tr
                    key={row.membershipId}
                    className={isSelected ? "table-active" : undefined}
                  >
                    <td>
                      <button
                        type="button"
                        className="btn btn-link text-start text-decoration-none p-0"
                        onClick={() => {
                          setSelected(row);
                          window.requestAnimationFrame(() => {
                            document
                              .getElementById("user-activity-detail")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }}
                      >
                        <span className="fw-semibold d-block">{row.displayName}</span>
                      </button>
                      <div className="small text-muted">{row.email || "—"}</div>
                      {row.roles.length > 0 ? (
                        <div
                          className="small text-muted text-truncate"
                          style={{ maxWidth: "18rem" }}
                        >
                          {row.roles.join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${statusBadge(row.membershipStatus)}`}>
                        {row.membershipStatus || "—"}
                      </span>
                    </td>
                    <td>
                      <div>{formatActivityTimestamp(row.lastLoginAt)}</div>
                      <div className="small text-muted">
                        {formatActivityRelative(row.lastLoginAt, nowMs)}
                      </div>
                    </td>
                    <td>
                      <div>{formatActivityTimestamp(row.lastActivityAt)}</div>
                      <div className="small text-muted">
                        {formatActivityRelative(row.lastActivityAt, nowMs)}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${online ? "bg-label-success" : "bg-label-secondary"}`}
                      >
                        {online ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-footer small text-muted">
          Click a user name to see audited actions and access changes. Routine browsing is not
          written to the audit log.{" "}
          <Link href="/settings/users/">Manage users</Link>
        </div>
      </div>
    </>
  );
}

function isFresh(lastActivityAt: string | null, nowMs: number): boolean {
  if (!lastActivityAt) return false;
  const ts = Date.parse(lastActivityAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= 3 * 60 * 1000;
}

export function UserActivitySettingsCard() {
  const { me } = useAuth();
  if (!canAccessUserActivity(me)) return null;
  return (
    <AdminSectionCard
      title="User activity"
      description="Review login times and recent Platform activity for Admin and Creator oversight."
      icon="bx-time-five"
      tone="info"
      href="/settings/user-activity/"
      actionLabel="View activity"
    />
  );
}
