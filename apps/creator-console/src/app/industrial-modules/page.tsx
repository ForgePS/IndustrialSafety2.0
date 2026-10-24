"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  INDUSTRIAL_MODULE_REGISTRY,
  INDUSTRIAL_PRODUCT_CODE,
  industrialAvailabilityLabel,
  industrialModuleIsToggleable,
} from "@forge/contracts";
import {
  Alert,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  ForgePageActions,
  ForgePageHeader,
  LoadingState,
  StatusBadge,
  useToast,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantPicker } from "@/components/tenant-picker";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type ModuleEntitlement = {
  id: string;
  status: string;
  moduleCode: string;
  moduleName: string;
};

type ProductEntitlement = {
  id: string;
  status: string;
  productCode: string;
  productName: string;
};

type EntitlementsPayload = {
  products: ProductEntitlement[];
  modules: ModuleEntitlement[];
};

type TenantRow = { id: string; displayName: string };

function isModuleActive(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "ACTIVE";
}

function IndustrialModulesInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const toast = useToast();

  const [tenantName, setTenantName] = useState<string>("Customer");
  const [data, setData] = useState<EntitlementsPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState<"enable" | "disable" | null>(null);
  const [detailsCode, setDetailsCode] = useState<string | null>(null);

  const [catalogCodes, setCatalogCodes] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [entitlements, tenants, catalog] = await Promise.all([
        apiGet<EntitlementsPayload>(`/api/v1/tenants/${tenantId}/entitlements`),
        apiGet<TenantRow[]>("/api/v1/platform/tenants").catch(() => [] as TenantRow[]),
        apiGet<Array<{ code: string; productCode?: string }>>("/api/v1/platform/modules").catch(
          () => [],
        ),
      ]);
      setData(entitlements);
      setTenantName(tenants.find((t) => t.id === tenantId)?.displayName ?? "Customer");
      setCatalogCodes(
        new Set(
          catalog
            .filter((m) => !m.productCode || m.productCode === INDUSTRIAL_PRODUCT_CODE)
            .map((m) => m.code),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load module access.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const productEntitled = useMemo(
    () =>
      Boolean(
        data?.products.some(
          (p) => p.productCode === INDUSTRIAL_PRODUCT_CODE && isModuleActive(p.status),
        ),
      ),
    [data],
  );

  const entitlementByCode = useMemo(() => {
    const map = new Map<string, ModuleEntitlement>();
    for (const row of data?.modules ?? []) {
      map.set(row.moduleCode, row);
    }
    return map;
  }, [data]);

  const rows = useMemo(
    () =>
      INDUSTRIAL_MODULE_REGISTRY.filter((m) => m.code !== "CORE").map((mod) => {
        const ent = entitlementByCode.get(mod.code);
        const customerOn = isModuleActive(ent?.status);
        const inCatalog = catalogCodes.size === 0 || catalogCodes.has(mod.code);
        const toggleable = industrialModuleIsToggleable(mod) && inCatalog;
        return {
          ...mod,
          customerOn,
          toggleable,
          inCatalog,
          entitlementStatus: ent?.status ?? "OFF",
        };
      }),
    [entitlementByCode, catalogCodes],
  );

  async function setModuleAccess(moduleCode: string, enable: boolean) {
    if (!tenantId) return;
    const entry = INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === moduleCode);
    if (!entry || !industrialModuleIsToggleable(entry)) {
      toast.push("This module cannot be enabled until it is Ready in AWS.", "warning");
      return;
    }
    setBusyCode(moduleCode);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/modules/${moduleCode}/entitlement`, "PUT", {
        status: enable ? "ACTIVE" : "SUSPENDED",
        productCode: INDUSTRIAL_PRODUCT_CODE,
      });
      toast.push(
        enable
          ? `${entry.name} enabled for ${tenantName}.`
          : `${entry.name} disabled for ${tenantName}.`,
        "success",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Module update failed.");
      toast.push("Module update failed", "danger");
    } finally {
      setBusyCode(null);
    }
  }

  async function runBulk(mode: "enable" | "disable") {
    if (!tenantId) return;
    const targets = rows.filter(
      (r) => r.toggleable && (mode === "enable" ? !r.customerOn : r.customerOn),
    );
    setBulkOpen(null);
    for (const row of targets) {
      await setModuleAccess(row.code, mode === "enable");
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Industrial modules"
          subtitle="Choose a customer to manage Forge Industrial Safety module access."
        />
        <TenantPicker
          targetPath="/industrial-modules"
          description="Select a customer before managing Industrial modules."
        />
      </section>
    );
  }

  const details = detailsCode
    ? INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === detailsCode)
    : null;

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Industrial modules"
        subtitle={`${tenantName} · Forge Industrial Safety`}
        actions={
          <ForgePageActions>
            <Link className="forge-btn forge-btn--outline" href={tenantDetailHref(tenantId)}>
              Open customer
            </Link>
            <button
              type="button"
              className="forge-btn forge-btn--outline"
              disabled={!productEntitled || loading}
              onClick={() => setBulkOpen("enable")}
            >
              Enable all ready
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--secondary"
              disabled={!productEntitled || loading}
              onClick={() => setBulkOpen("disable")}
            >
              Disable optional
            </button>
          </ForgePageActions>
        }
      />

      {!productEntitled && !loading ? (
        <Alert tone="info">
          Forge Industrial Safety is not entitled for this customer. Enable the product under{" "}
          <Link href={`/entitlements/?tenantId=${encodeURIComponent(tenantId)}`}>
            Product Access
          </Link>{" "}
          before assigning modules.
        </Alert>
      ) : null}

      {error ? <ErrorState title="Module access error" description={error} /> : null}
      {loading ? <LoadingState label="Loading modules…" /> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No modules" description="Industrial registry is empty." />
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.panel} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Module</th>
                <th>Category</th>
                <th>Availability</th>
                <th>Customer access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.group}</td>
                  <td>
                    <StatusBadge
                      tone={
                        row.implementationStatus === "AVAILABLE"
                          ? "success"
                          : row.implementationStatus === "LEGACY_ONLY"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {industrialAvailabilityLabel(row.implementationStatus)}
                    </StatusBadge>
                  </td>
                  <td>
                    {row.toggleable ? (
                      <StatusBadge tone={row.customerOn ? "success" : "neutral"}>
                        {row.customerOn ? "On" : "Off"}
                      </StatusBadge>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {row.toggleable ? (
                        <button
                          type="button"
                          className={
                            row.customerOn ? "forge-btn forge-btn--secondary" : "forge-btn"
                          }
                          disabled={!productEntitled || busyCode === row.code}
                          onClick={() => void setModuleAccess(row.code, !row.customerOn)}
                        >
                          {busyCode === row.code
                            ? "Saving…"
                            : row.customerOn
                              ? "Disable"
                              : "Enable"}
                        </button>
                      ) : row.implementationStatus !== "AVAILABLE" ? (
                        <span className={styles.muted}>Not ready in AWS</span>
                      ) : (
                        <span className={styles.muted}>Not in platform catalog</span>
                      )}
                      <button
                        type="button"
                        className="forge-btn forge-btn--outline"
                        onClick={() => setDetailsCode(row.code)}
                      >
                        View details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {details ? (
        <div className={styles.panel}>
          <h2>{details.name} — details</h2>
          <dl className={styles.dl}>
            <dt>Availability</dt>
            <dd>{industrialAvailabilityLabel(details.implementationStatus)}</dd>
            <dt>Category</dt>
            <dd>{details.group}</dd>
            <dt>Route</dt>
            <dd>{details.route}</dd>
            <dt>Technical status</dt>
            <dd className={styles.mono}>{details.migrationStatus}</dd>
            <dt>Toggleable</dt>
            <dd>{industrialModuleIsToggleable(details) ? "Yes" : "No — not Ready in AWS"}</dd>
          </dl>
          <button
            type="button"
            className="forge-btn forge-btn--secondary"
            onClick={() => setDetailsCode(null)}
          >
            Close details
          </button>
        </div>
      ) : null}

      <ConfirmationDialog
        open={bulkOpen === "enable"}
        title="Enable all ready modules?"
        description={`This enables every AWS-ready Industrial module for ${tenantName}. Legacy-only modules stay blocked.`}
        confirmLabel="Enable all ready"
        onCancel={() => setBulkOpen(null)}
        onConfirm={() => void runBulk("enable")}
      />
      <ConfirmationDialog
        open={bulkOpen === "disable"}
        title="Disable optional modules?"
        description={`This turns off customer access for ready modules for ${tenantName}. Core product entitlement is unchanged.`}
        confirmLabel="Disable optional"
        danger
        onCancel={() => setBulkOpen(null)}
        onConfirm={() => void runBulk("disable")}
      />
    </section>
  );
}

export default function IndustrialModulesPage() {
  return (
    <PlatformPageGate title="Industrial modules" permission="platform.entitlement.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <IndustrialModulesInner />
      </Suspense>
    </PlatformPageGate>
  );
}
