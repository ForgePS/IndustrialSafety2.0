"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IndustrialNavItem } from "@/lib/navigation";
import { buildWorkspaceRegistry, getWorkspaceModuleDefinition } from "@/lib/workspace/registry";
import {
  clearWorkspaceLayout,
  defaultWorkspaceLayout,
  loadWorkspaceLayout,
  moveWorkspaceItem,
  reorderWorkspaceItems,
  resetWorkspaceItem,
  updateWorkspaceItem,
  visibleWorkspaceItems,
  writeWorkspaceLayout,
} from "@/lib/workspace/layout";
import { workspaceColumnSpan } from "@/lib/workspace/sizing";
import type { WorkspaceLayoutState, WorkspaceWidgetSize } from "@/lib/workspace/types";
import {
  canUserAddModule,
  canUserHideModule,
  canUserResizeModule,
  inferWorkspaceRoleCodes,
  layoutFromDefaultItems,
  loadTenantWorkspaceDefaults,
  policyMapFromDefaults,
  selectEffectiveDefaultItems,
} from "@/lib/workspace/tenant-defaults";
import { WorkspaceCard } from "./workspace-card";
import "./workspace.css";

type Props = {
  modules: IndustrialNavItem[];
  tenantId: string;
  userId: string;
  iconForCode: (code: string) => string;
  captionForModule: (mod: IndustrialNavItem) => string;
  permissions?: readonly string[];
  isPlatformAdmin?: boolean;
};

/**
 * My Workspace — configurable module grid with variable widget sizes.
 * Applies tenant/role defaults on first use and enforces Required/Hidden policies.
 */
export function MyWorkspace({
  modules,
  tenantId,
  userId,
  iconForCode,
  captionForModule,
  permissions = [],
  isPlatformAdmin = false,
}: Props) {
  const moduleSignature = useMemo(
    () => modules.map((mod) => `${mod.code}\0${mod.name}\0${mod.route}`).join("\n"),
    [modules],
  );

  const registry = useMemo(
    () =>
      buildWorkspaceRegistry(
        modules.map((mod) => ({ code: mod.code, name: mod.name, route: mod.route })),
        iconForCode,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [moduleSignature, iconForCode],
  );

  const moduleByCode = useMemo(
    () => new Map(modules.map((mod) => [mod.code, mod])),
    [modules],
  );

  const roleCodes = useMemo(
    () => inferWorkspaceRoleCodes(permissions, isPlatformAdmin),
    [permissions, isPlatformAdmin],
  );

  const tenantDefaults = useMemo(
    () => loadTenantWorkspaceDefaults(tenantId, registry),
    [tenantId, registry],
  );

  const effectiveDefaults = useMemo(
    () => selectEffectiveDefaultItems(tenantDefaults, roleCodes),
    [tenantDefaults, roleCodes],
  );

  const policies = useMemo(() => policyMapFromDefaults(effectiveDefaults), [effectiveDefaults]);

  const [layout, setLayout] = useState<WorkspaceLayoutState>(() =>
    defaultWorkspaceLayout(registry),
  );
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dragKeyRef = useRef<string | null>(null);
  const dragOverKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const fromTenant = layoutFromDefaultItems(effectiveDefaults, registry);
    setLayout(
      loadWorkspaceLayout(tenantId, userId, registry, {
        tenantDefaults: fromTenant,
        policies,
      }),
    );
  }, [tenantId, userId, registry, effectiveDefaults, policies]);

  const persist = useCallback(
    (next: WorkspaceLayoutState | ((prev: WorkspaceLayoutState) => WorkspaceLayoutState)) => {
      setLayout((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        writeWorkspaceLayout(tenantId, userId, resolved);
        return resolved;
      });
    },
    [tenantId, userId],
  );

  const visible = useMemo(() => visibleWorkspaceItems(layout), [layout]);

  const hiddenModules = useMemo(
    () =>
      layout.items
        .filter((item) => !item.isVisible && canUserAddModule(item.moduleKey, policies))
        .map((item) => getWorkspaceModuleDefinition(registry, item.moduleKey))
        .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod)),
    [layout.items, registry, policies],
  );

  const patchItem = useCallback(
    (
      moduleKey: string,
      patch: Partial<{ size: WorkspaceWidgetSize; defaultView: string; isVisible: boolean }>,
    ) => {
      if (patch.isVisible === false && !canUserHideModule(moduleKey, policies)) return;
      if (patch.size && !canUserResizeModule(moduleKey, effectiveDefaults)) return;
      persist((prev) => updateWorkspaceItem(prev, moduleKey, patch, registry));
    },
    [persist, registry, policies, effectiveDefaults],
  );

  const handleResetWorkspace = () => {
    clearWorkspaceLayout(tenantId, userId);
    const fromTenant = layoutFromDefaultItems(effectiveDefaults, registry);
    persist(fromTenant);
    setConfirmReset(false);
    setEditing(false);
  };

  if (modules.length === 0) {
    return (
      <div className="card border shadow-none">
        <div className="card-body p-3">
          <p className="mb-1 small">No modules are enabled for this customer yet.</p>
          <p className="text-muted small mb-0">
            A platform administrator can enable Ready modules in Creator Console under the
            customer&apos;s Products &amp; Modules screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="forge-ws" aria-labelledby="forge-ws-title">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h5 className="mb-1" id="forge-ws-title">
            My Workspace
          </h5>
          <p className="text-muted small mb-0">
            {editing
              ? "Drag to reorder, change sizes, or restore hidden modules."
              : "Your apps, schedule, tasks, reminders, and daily work in one place."}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {editing ? (
            <>
              {hiddenModules.length > 0 ? (
                <label className="d-flex align-items-center gap-2 mb-0">
                  <span className="visually-hidden">Add module to workspace</span>
                  <select
                    className="form-select form-select-sm"
                    style={{ minWidth: "10rem" }}
                    defaultValue=""
                    onChange={(event) => {
                      const code = event.target.value;
                      if (!code) return;
                      patchItem(code, { isVisible: true });
                      event.target.value = "";
                    }}
                  >
                    <option value="">Add module…</option>
                    {hiddenModules.map((mod) => (
                      <option key={mod.key} value={mod.key}>
                        {mod.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => setConfirmReset(true)}
              >
                Reset Workspace
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setEditing(false);
                  setConfirmReset(false);
                }}
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setEditing(true)}
            >
              Customize Workspace
            </button>
          )}
        </div>
      </div>

      {confirmReset ? (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3" role="status">
          <span className="small mb-0">
            Reset workspace to your company default layout? This will remove your custom sizes,
            positions, and views.
          </span>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={handleResetWorkspace}>
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-muted small mb-0">
          No workspace items selected. Choose <strong>Customize Workspace</strong> to add modules.
        </p>
      ) : (
        <div className="forge-ws-grid" role="navigation" aria-labelledby="forge-ws-title">
          {visible.map((item) => {
            const definition = getWorkspaceModuleDefinition(registry, item.moduleKey);
            const nav = moduleByCode.get(item.moduleKey);
            if (!definition || !nav) return null;
            const span = workspaceColumnSpan(item.size);
            const canHide = canUserHideModule(item.moduleKey, policies);
            const canResize = canUserResizeModule(item.moduleKey, effectiveDefaults);
            return (
              <div
                key={item.moduleKey}
                className={`forge-ws-cell forge-ws-span-${span}`}
              >
                <WorkspaceCard
                  definition={definition}
                  item={item}
                  caption={captionForModule(nav)}
                  editing={editing}
                  dragEnabled={editing}
                  canHide={canHide}
                  canResize={canResize}
                  onSizeChange={(size) => patchItem(item.moduleKey, { size })}
                  onViewChange={(view) => patchItem(item.moduleKey, { defaultView: view })}
                  onHide={() => patchItem(item.moduleKey, { isVisible: false })}
                  onReset={() =>
                    persist((prev) => resetWorkspaceItem(prev, item.moduleKey, registry))
                  }
                  onExpand={() => {
                    if (!canResize) return;
                    const expandTo = definition.expandSize ?? "medium";
                    patchItem(item.moduleKey, { size: expandTo });
                  }}
                  onMove={(direction) =>
                    persist((prev) => moveWorkspaceItem(prev, item.moduleKey, direction))
                  }
                  onDragStart={(key) => {
                    dragKeyRef.current = key;
                    dragOverKeyRef.current = null;
                  }}
                  onDragOver={(overKey) => {
                    const fromKey = dragKeyRef.current;
                    if (!fromKey || fromKey === overKey || dragOverKeyRef.current === overKey) return;
                    dragOverKeyRef.current = overKey;
                    persist((prev) => {
                      const keys = visibleWorkspaceItems(prev).map((v) => v.moduleKey);
                      const fromIndex = keys.indexOf(fromKey);
                      const toIndex = keys.indexOf(overKey);
                      if (fromIndex < 0 || toIndex < 0) return prev;
                      const nextKeys = [...keys];
                      nextKeys.splice(fromIndex, 1);
                      nextKeys.splice(toIndex, 0, fromKey);
                      const hidden = prev.items
                        .filter((row) => !row.isVisible)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((row) => row.moduleKey);
                      return reorderWorkspaceItems(prev, [...nextKeys, ...hidden]);
                    });
                  }}
                  onDragEnd={() => {
                    dragKeyRef.current = null;
                    dragOverKeyRef.current = null;
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
