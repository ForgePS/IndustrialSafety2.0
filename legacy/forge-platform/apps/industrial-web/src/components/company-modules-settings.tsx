"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { canManageCompanyModules } from "@/lib/platform-admin";

type CompanyModuleRow = {
  code: string;
  name: string;
  group: string;
  implementationStatus: string;
  availabilityLabel: string;
  enabled: boolean;
  entitlementStatus: string;
  toggleable: boolean;
};

type ModulesPayload = {
  productEntitled: boolean;
  modules: CompanyModuleRow[];
};

export function CompanyModulesSettings() {
  const { me, refresh } = useAuth();
  const canManage = canManageCompanyModules(me);
  const [data, setData] = useState<ModulesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiGet<ModulesPayload>("/api/v1/industrial/settings/modules");
      setData(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load company modules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  const groups = useMemo(() => {
    const map = new Map<string, CompanyModuleRow[]>();
    for (const row of data?.modules ?? []) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return [...map.entries()];
  }, [data]);

  const enabledCount = useMemo(() => (data?.modules ?? []).filter((m) => m.enabled).length, [data]);

  async function toggleModule(row: CompanyModuleRow) {
    if (!row.toggleable || busyCode) return;
    setBusyCode(row.code);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiSend<CompanyModuleRow>(
        `/api/v1/industrial/settings/modules/${encodeURIComponent(row.code)}`,
        "PUT",
        { enabled: !row.enabled },
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map((m) => (m.code === updated.code ? updated : m)),
            }
          : prev,
      );
      setMessage(
        updated.enabled
          ? `${updated.name} is now on. Users will see it after they refresh.`
          : `${updated.name} is now off until you turn it back on.`,
      );
      await refresh().catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update module.");
    } finally {
      setBusyCode(null);
    }
  }

  if (!canManage) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        Only company admins can turn modules on or off.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Platform admin</p>
        <h1 className="h4 mb-1">Company modules</h1>
        <p className="text-muted mb-0">
          Turn modules on when your team is ready to use them. Unchecked modules stay hidden from
          the navigation until you enable them.
        </p>
      </div>

      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-muted">Loading modules…</p> : null}

      {!loading && data && !data.productEntitled ? (
        <div className="alert alert-warning" role="status">
          Forge Industrial is not entitled for this company yet. Contact Forge support before
          enabling modules.
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <p className="text-muted small mb-3">
            {enabledCount} of {data.modules.length} modules on
          </p>
          <div className="d-flex flex-column gap-3">
            {groups.map(([group, rows]) => (
              <div className="card border shadow-none" key={group}>
                <div className="card-header bg-transparent">
                  <h2 className="h6 mb-0">{group}</h2>
                </div>
                <ul className="list-group list-group-flush">
                  {rows.map((row) => {
                    const inputId = `module-${row.code}`;
                    return (
                      <li
                        key={row.code}
                        className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2"
                      >
                        <div className="min-w-0">
                          <div className="fw-semibold">{row.name}</div>
                          <div className="text-muted small">
                            {row.availabilityLabel}
                            {!row.toggleable ? " · cannot be toggled yet" : null}
                          </div>
                        </div>
                        <div className="form-check form-switch m-0">
                          <input
                            id={inputId}
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={row.enabled}
                            disabled={
                              !row.toggleable || !data.productEntitled || busyCode === row.code
                            }
                            onChange={() => void toggleModule(row)}
                            aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
                          />
                          <label className="form-check-label small text-muted" htmlFor={inputId}>
                            {busyCode === row.code ? "Saving…" : row.enabled ? "On" : "Off"}
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
