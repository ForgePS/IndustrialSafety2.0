"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { canManageCompanyModules } from "@/lib/platform-admin";
import { buildIndustrialNavigation } from "@/lib/navigation";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { buildWorkspaceRegistry } from "@/lib/workspace/registry";
import {
  WORKSPACE_POLICY_LABELS,
  WORKSPACE_SIZE_LABELS,
  type WorkspaceDefaultItem,
  type WorkspaceItemPolicy,
  type WorkspaceTenantDefaults,
  type WorkspaceWidgetSize,
} from "@/lib/workspace/types";
import {
  buildDefaultsFromKeys,
  emptyTenantDefaults,
  loadTenantWorkspaceDefaults,
  starterRoleDefaultKeys,
  WORKSPACE_ROLE_PRESETS,
  writeTenantWorkspaceDefaults,
} from "@/lib/workspace/tenant-defaults";

function moduleIcon(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("task")) return "bx-task";
  if (c.includes("calendar")) return "bx-calendar";
  if (c.includes("remind")) return "bx-bell";
  if (c.includes("fleet")) return "bx-car";
  if (c.includes("train")) return "bx-book";
  if (c.includes("inspect")) return "bx-check-shield";
  if (c.includes("incident")) return "bx-error";
  return "bx-cube";
}

type EditorTab = "tenant" | WorkspaceRolePresetCodeLike;
type WorkspaceRolePresetCodeLike = (typeof WORKSPACE_ROLE_PRESETS)[number]["code"];

/**
 * Settings → Workspace defaults (tenant + role layouts and policies).
 */
export function WorkspaceDefaultsSettings() {
  const { me } = useAuth();
  const canManage = canManageCompanyModules(me);
  const tenantId = me?.tenantId ?? "";

  const entitled =
    Boolean(me?.isPlatformAdmin) || Boolean(me?.activeProducts?.includes(INDUSTRIAL_PRODUCT_CODE));
  const nav = useMemo(
    () =>
      buildIndustrialNavigation({
        entitled,
        permissions: me?.isPlatformAdmin
          ? ["industrial.access", ...(me?.permissions ?? [])]
          : (me?.permissions ?? []),
        flags: {},
        enabledModules: me?.activeModules ?? [],
        strictEntitlements: true,
      }),
    [entitled, me],
  );

  const available = useMemo(
    () => nav.filter((n) => n.available && n.code !== "CORE"),
    [nav],
  );

  const registry = useMemo(
    () =>
      buildWorkspaceRegistry(
        available.map((mod) => ({ code: mod.code, name: mod.name, route: mod.route })),
        moduleIcon,
      ),
    [available],
  );

  const [defaults, setDefaults] = useState<WorkspaceTenantDefaults>(() =>
    emptyTenantDefaults(registry),
  );
  const [tab, setTab] = useState<EditorTab>("tenant");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || registry.length === 0) return;
    setDefaults(loadTenantWorkspaceDefaults(tenantId, registry));
  }, [tenantId, registry]);

  const persist = useCallback(
    (next: WorkspaceTenantDefaults) => {
      setDefaults(next);
      if (tenantId) writeTenantWorkspaceDefaults(tenantId, next);
      setMessage("Workspace defaults saved for this browser/tenant.");
    },
    [tenantId],
  );

  const editingItems: WorkspaceDefaultItem[] = useMemo(() => {
    if (tab === "tenant") return defaults.items;
    return defaults.roleDefaults[tab] ?? emptyTenantDefaults(registry).items;
  }, [defaults, tab, registry]);

  const setEditingItems = (items: WorkspaceDefaultItem[]) => {
    if (tab === "tenant") {
      persist({ ...defaults, items });
      return;
    }
    persist({
      ...defaults,
      roleDefaults: { ...defaults.roleDefaults, [tab]: items },
    });
  };

  const patchRow = (moduleKey: string, patch: Partial<WorkspaceDefaultItem>) => {
    setEditingItems(
      editingItems.map((row) => (row.moduleKey === moduleKey ? { ...row, ...patch } : row)),
    );
  };

  const moveRow = (moduleKey: string, direction: "up" | "down") => {
    const keys = editingItems.map((row) => row.moduleKey);
    const index = keys.indexOf(moduleKey);
    if (index < 0) return;
    const next = [...keys];
    if (direction === "up" && index > 0) {
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    } else if (direction === "down" && index < next.length - 1) {
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    } else {
      return;
    }
    const byKey = new Map(editingItems.map((row) => [row.moduleKey, row]));
    setEditingItems(
      next.map((key, sortOrder) => {
        const row = byKey.get(key)!;
        return { ...row, sortOrder };
      }),
    );
  };

  const applyStarter = () => {
    if (tab === "tenant") {
      const keys = registry.map((m) => m.key);
      persist({
        ...defaults,
        items: buildDefaultsFromKeys(keys, registry, {
          requiredKeys: ["CALENDAR", "TASKS", "REMINDERS"],
          policyForRest: "default",
        }),
      });
      return;
    }
    const keys = starterRoleDefaultKeys(tab).filter((key) =>
      registry.some((mod) => mod.key === key),
    );
    persist({
      ...defaults,
      roleDefaults: {
        ...defaults.roleDefaults,
        [tab]: buildDefaultsFromKeys(keys, registry, {
          requiredKeys: ["CALENDAR", "TASKS", "REMINDERS"],
          policyForRest: "optional",
        }),
      },
    });
  };

  if (!canManage) {
    return (
      <div className="alert alert-warning" role="status">
        You need industrial admin permission to manage workspace defaults.
      </div>
    );
  }

  if (registry.length === 0) {
    return (
      <div className="alert alert-info" role="status">
        Enable modules under Company modules before configuring workspace defaults.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Modules</p>
        <h1 className="h4 mb-1">Workspace defaults</h1>
        <p className="text-muted mb-0">
          Define the initial My Workspace layout for this company, including required modules and
          optional role presets. Users receive these defaults on first use and when they reset.
        </p>
      </div>

      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          className={`btn btn-sm ${tab === "tenant" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setTab("tenant")}
        >
          Company default
        </button>
        {WORKSPACE_ROLE_PRESETS.map((role) => (
          <button
            key={role.code}
            type="button"
            className={`btn btn-sm ${tab === role.code ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setTab(role.code)}
          >
            {role.label}
          </button>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={applyStarter}>
          Apply starter layout
        </button>
        {tab !== "tenant" && defaults.roleDefaults[tab] ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => {
              const next = { ...defaults.roleDefaults };
              delete next[tab];
              persist({ ...defaults, roleDefaults: next });
            }}
          >
            Clear role overlay
          </button>
        ) : null}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Module</th>
                <th scope="col">Policy</th>
                <th scope="col">Size</th>
                <th scope="col">Lock size</th>
              </tr>
            </thead>
            <tbody>
              {[...editingItems]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((row) => {
                  const mod = registry.find((r) => r.key === row.moduleKey);
                  if (!mod) return null;
                  return (
                    <tr key={row.moduleKey}>
                      <td className="text-nowrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-icon"
                          aria-label={`Move ${mod.label} up`}
                          onClick={() => moveRow(row.moduleKey, "up")}
                        >
                          <i className="bx bx-up-arrow-alt" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-icon"
                          aria-label={`Move ${mod.label} down`}
                          onClick={() => moveRow(row.moduleKey, "down")}
                        >
                          <i className="bx bx-down-arrow-alt" />
                        </button>
                      </td>
                      <td>
                        <div className="fw-semibold">{mod.label}</div>
                        <div className="small text-muted">{row.moduleKey}</div>
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          aria-label={`${mod.label} policy`}
                          value={row.policy}
                          onChange={(event) =>
                            patchRow(row.moduleKey, {
                              policy: event.target.value as WorkspaceItemPolicy,
                            })
                          }
                        >
                          {(Object.keys(WORKSPACE_POLICY_LABELS) as WorkspaceItemPolicy[]).map(
                            (policy) => (
                              <option key={policy} value={policy}>
                                {WORKSPACE_POLICY_LABELS[policy]}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          aria-label={`${mod.label} size`}
                          value={row.size}
                          onChange={(event) =>
                            patchRow(row.moduleKey, {
                              size: event.target.value as WorkspaceWidgetSize,
                            })
                          }
                        >
                          {mod.supportedSizes.map((size) => (
                            <option key={size} value={size}>
                              {WORKSPACE_SIZE_LABELS[size]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={Boolean(row.sizeLocked)}
                          aria-label={`Lock size for ${mod.label}`}
                          onChange={(event) =>
                            patchRow(row.moduleKey, {
                              sizeLocked: event.target.checked,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="small text-muted mt-3 mb-0">
        <strong>Required</strong> always appears and cannot be hidden by users.{" "}
        <strong>Default</strong> appears initially. <strong>Optional</strong> can be added later.{" "}
        <strong>Hidden</strong> is unavailable in Customize Workspace. Defaults are stored in this
        browser for the tenant until a server preference API is added.
      </p>
    </div>
  );
}
