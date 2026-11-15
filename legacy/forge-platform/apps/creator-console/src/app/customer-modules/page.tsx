"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  FORGE_PLATFORMS,
  catalogAvailabilityLabel,
  findCatalogModule,
  modulesForProduct,
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
import localStyles from "./customer-modules.module.css";

type ModuleEntitlement = {
  id: string;
  status: string;
  moduleCode: string;
  moduleName: string;
  productCode?: string;
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

type PlatformProduct = { id: string; code: string; name: string };

type RawCatalogModule = {
  id: string;
  code: string;
  name: string;
  productId?: string;
  product_id?: string;
  productCode?: string;
  product_code?: string;
  isCore?: boolean;
  is_core?: boolean;
  status?: string;
};

type CatalogModule = {
  id: string;
  code: string;
  name: string;
  productCode: string;
  category: string;
  classification: string;
  implementationStatus: string;
  customerAssignable: boolean;
  isCore: boolean;
};

type TenantRow = { id: string; displayName: string };

function isActive(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "ACTIVE";
}

function moduleProductId(row: RawCatalogModule): string | undefined {
  return row.productId ?? row.product_id;
}

function moduleIsCore(row: RawCatalogModule): boolean {
  return Boolean(row.isCore ?? row.is_core) || row.code === "CORE";
}

/**
 * Resolve a seeded platform_modules row for (productCode, moduleCode).
 * Prefer productId match; if the code is unique in the catalog, accept that row.
 */
function resolveSeededModule(
  rows: RawCatalogModule[],
  products: PlatformProduct[],
  productCode: string,
  moduleCode: string,
): RawCatalogModule | undefined {
  const product = products.find((p) => p.code === productCode);
  const matches = rows.filter(
    (m) => m.code === moduleCode && (m.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
  );
  if (product) {
    const byProduct = matches.find((m) => moduleProductId(m) === product.id);
    if (byProduct) return byProduct;
  }
  const withExplicitCode = matches.find((m) => (m.productCode ?? m.product_code) === productCode);
  if (withExplicitCode) return withExplicitCode;
  if (matches.length === 1) return matches[0];
  return undefined;
}

function toCatalogModule(row: RawCatalogModule, productCode: string): CatalogModule {
  const meta = findCatalogModule(productCode, row.code);
  const isCore = moduleIsCore(row);
  const classification = meta?.classification ?? (isCore ? "PLATFORM_CORE" : "CUSTOMER_MODULE");
  const implementationStatus = meta?.implementationStatus ?? "READY";
  const customerAssignable =
    meta?.customerAssignable ??
    (!isCore &&
      productCode !== "FORGE_CREATOR" &&
      classification !== "PLATFORM_CORE" &&
      classification !== "INTERNAL_TOOL");
  return {
    id: row.id,
    code: row.code,
    name: meta?.name ?? row.name,
    productCode,
    category: meta?.category ?? (isCore ? "Platform" : "General"),
    classification,
    implementationStatus,
    customerAssignable,
    isCore,
  };
}

/**
 * Build assignable modules for a product:
 * contracts definition ∩ seeded platform_modules rows (saveable).
 */
function buildProductModules(
  productCode: string,
  rawModules: RawCatalogModule[],
  products: PlatformProduct[],
): CatalogModule[] {
  const out: CatalogModule[] = [];
  for (const def of modulesForProduct(productCode)) {
    if (!def.customerAssignable) continue;
    if (def.classification === "PLATFORM_CORE" || def.classification === "INTERNAL_TOOL") {
      continue;
    }
    const seeded = resolveSeededModule(rawModules, products, productCode, def.code);
    if (!seeded) continue;
    out.push(toCatalogModule(seeded, productCode));
  }

  // Also include any seeded rows for this product that contracts missed (legacy seed).
  const product = products.find((p) => p.code === productCode);
  for (const row of rawModules) {
    if ((row.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") continue;
    const rowProduct =
      row.productCode ??
      row.product_code ??
      (product && moduleProductId(row) === product.id ? productCode : undefined);
    if (rowProduct !== productCode) continue;
    if (out.some((m) => m.code === row.code)) continue;
    const mapped = toCatalogModule(row, productCode);
    if (!mapped.customerAssignable || mapped.isCore) continue;
    out.push(mapped);
  }

  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

const CUSTOMER_PLATFORMS = FORGE_PLATFORMS.filter((p) => p.customerAssignable);

function CustomerModulesInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const productParam = searchParams.get("productCode");
  const toast = useToast();

  const [tenantName, setTenantName] = useState("Customer");
  const [data, setData] = useState<EntitlementsPayload | null>(null);
  const [rawModules, setRawModules] = useState<RawCatalogModule[]>([]);
  const [products, setProducts] = useState<PlatformProduct[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [productCode, setProductCode] = useState(productParam ?? "FORGE_INDUSTRIAL");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [baseline, setBaseline] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<"enable" | "disable" | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [entitlements, tenants, productRows, moduleRows] = await Promise.all([
        apiGet<EntitlementsPayload>(`/api/v1/tenants/${tenantId}/entitlements`),
        apiGet<TenantRow[]>("/api/v1/platform/tenants").catch(() => [] as TenantRow[]),
        apiGet<PlatformProduct[]>("/api/v1/platform/products"),
        apiGet<RawCatalogModule[]>("/api/v1/platform/modules"),
      ]);
      setData(entitlements);
      setTenantName(tenants.find((t) => t.id === tenantId)?.displayName ?? "Customer");
      setProducts(productRows);
      setRawModules(moduleRows);
      const activeProduct =
        productParam &&
        entitlements.products.some((p) => p.productCode === productParam && isActive(p.status))
          ? productParam
          : (entitlements.products.find(
              (p) => isActive(p.status) && p.productCode !== "FORGE_CREATOR",
            )?.productCode ?? "FORGE_INDUSTRIAL");
      setProductCode(activeProduct);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load products and modules.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, productParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const productEntitled = useMemo(
    () => Boolean(data?.products.some((p) => p.productCode === productCode && isActive(p.status))),
    [data, productCode],
  );

  const platform = CUSTOMER_PLATFORMS.find((p) => p.productCode === productCode);

  const productModules = useMemo(
    () => buildProductModules(productCode, rawModules, products),
    [productCode, rawModules, products],
  );

  const selectable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return productModules;
    return productModules.filter((m) =>
      [m.name, m.code, m.category].join(" ").toLowerCase().includes(needle),
    );
  }, [productModules, search]);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, boolean> = {};
    for (const mod of productModules) {
      const ent = data.modules.find(
        (m) => m.moduleCode === mod.code && (m.productCode ? m.productCode === productCode : true),
      );
      next[mod.code] = isActive(ent?.status);
    }
    setDraft(next);
    setBaseline(next);
    setDirty(false);
  }, [data, productCode, productModules]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogModule[]>();
    for (const row of selectable) {
      if (!map.has(row.category)) map.set(row.category, []);
      map.get(row.category)!.push(row);
    }
    return map;
  }, [selectable]);

  const enabledCount = useMemo(() => Object.values(draft).filter(Boolean).length, [draft]);
  const readyCount = useMemo(
    () => productModules.filter((m) => m.implementationStatus === "READY").length,
    [productModules],
  );

  async function setProductEnabled(enabled: boolean) {
    if (!tenantId) return;
    setSaving(true);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/products/${productCode}`, "PUT", {
        status: enabled ? "ACTIVE" : "DISABLED",
      });
      toast.push(
        enabled
          ? `${platform?.name ?? productCode} enabled`
          : `${platform?.name ?? productCode} disabled`,
        "success",
      );
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not update product", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function putOneModule(code: string, status: "ACTIVE" | "SUSPENDED") {
    if (!tenantId) return;
    await apiSend(`/api/v1/tenants/${tenantId}/modules/${code}/entitlement`, "PUT", {
      status,
      productCode,
    });
  }

  async function saveModules() {
    if (!tenantId || !productEntitled) return;
    const changes = productModules
      .filter((m) => m.implementationStatus === "READY")
      .filter((m) => Boolean(draft[m.code]) !== Boolean(baseline[m.code]))
      .map((m) => ({
        code: m.code,
        name: m.name,
        status: (draft[m.code] ? "ACTIVE" : "SUSPENDED") as "ACTIVE" | "SUSPENDED",
      }));

    if (changes.length === 0) {
      toast.push("No module changes to save.", "info");
      setDirty(false);
      return;
    }

    setSaving(true);
    try {
      try {
        await apiSend(`/api/v1/tenants/${tenantId}/products/${productCode}/modules`, "PUT", {
          modules: changes,
        });
      } catch (batchErr) {
        const message = batchErr instanceof Error ? batchErr.message : "";
        const batchMissing = /not found|404|Cannot PUT|Cannot POST/i.test(message);
        if (!batchMissing) throw batchErr;
        for (const item of changes) {
          try {
            await putOneModule(item.code, item.status);
          } catch (oneErr) {
            const oneMsg = oneErr instanceof Error ? oneErr.message : "Module update failed";
            throw new Error(
              `Could not ${item.status === "ACTIVE" ? "enable" : "disable"} ${item.name}. ${oneMsg}`,
            );
          }
        }
      }
      toast.push(
        changes.length === 1 ? `${changes[0]!.name} updated` : `${changes.length} modules updated`,
        "success",
      );
      setDirty(false);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save modules", "danger");
    } finally {
      setSaving(false);
    }
  }

  function applyBulk(mode: "enable" | "disable") {
    const next = { ...draft };
    for (const m of productModules) {
      if (m.implementationStatus !== "READY") continue;
      if (mode === "enable" && m.classification !== "CUSTOMER_MODULE") continue;
      next[m.code] = mode === "enable";
    }
    setDraft(next);
    setDirty(true);
    setBulkOpen(null);
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Products & Modules"
          subtitle="Select a customer to manage access."
        />
        <TenantPicker
          targetPath="/customer-modules"
          description="Select a customer before managing products and modules."
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Products & Modules"
        subtitle={`${tenantName} — assign Forge platforms and customer modules.`}
      />
      <ForgePageActions>
        <Link className="forge-btn forge-btn--secondary" href={tenantDetailHref(tenantId)}>
          Back to customer
        </Link>
        <Link
          className="forge-btn forge-btn--secondary"
          href={`/industrial-modules/?tenantId=${encodeURIComponent(tenantId)}`}
        >
          Industrial modules
        </Link>
        <TenantPicker targetPath="/customer-modules" description="Switch customer" />
      </ForgePageActions>

      {error ? <ErrorState title="Unable to load" description={error} /> : null}
      {loading ? <LoadingState label="Loading…" /> : null}

      {!loading && data ? (
        <>
          <div className={localStyles.productGrid}>
            {CUSTOMER_PLATFORMS.map((p) => {
              const ent = data.products.find((row) => row.productCode === p.productCode);
              const active = isActive(ent?.status);
              const count = buildProductModules(p.productCode, rawModules, products).filter((m) =>
                isActive(
                  data.modules.find(
                    (row) =>
                      row.moduleCode === m.code &&
                      (row.productCode ? row.productCode === p.productCode : true),
                  )?.status,
                ),
              ).length;
              return (
                <button
                  key={p.productCode}
                  type="button"
                  className={
                    productCode === p.productCode
                      ? localStyles.productCardActive
                      : localStyles.productCard
                  }
                  onClick={() => setProductCode(p.productCode)}
                >
                  <strong>{p.name}</strong>
                  <span>{active ? "ACTIVE" : "NOT ENABLED"}</span>
                  <span className={localStyles.muted}>
                    {active ? `${count} modules enabled` : "Enable product to assign modules"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={localStyles.panel}>
            <div className={localStyles.panelHead}>
              <div>
                <h2>{platform?.name ?? productCode}</h2>
                <p className={localStyles.muted}>
                  {productEntitled
                    ? `${enabledCount} of ${readyCount} catalog modules selected`
                    : "Enable this product before assigning modules."}
                </p>
                <p className={localStyles.muted}>
                  Showing {productModules.length} seeded module
                  {productModules.length === 1 ? "" : "s"} from the platform catalog.
                </p>
              </div>
              <div className={localStyles.actions}>
                {productEntitled ? (
                  <button
                    type="button"
                    className="forge-btn forge-btn--secondary"
                    disabled={saving}
                    onClick={() => void setProductEnabled(false)}
                  >
                    Disable product
                  </button>
                ) : (
                  <button
                    type="button"
                    className="forge-btn"
                    disabled={saving}
                    onClick={() => void setProductEnabled(true)}
                  >
                    Enable product
                  </button>
                )}
              </div>
            </div>

            {!productEntitled ? (
              <Alert tone="info">
                Enable the product above, then you can turn customer modules on or off.
              </Alert>
            ) : (
              <>
                <div className={localStyles.toolbar}>
                  <input
                    className={localStyles.search}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search modules…"
                  />
                  <button
                    type="button"
                    className="forge-btn forge-btn--secondary"
                    onClick={() => setBulkOpen("enable")}
                  >
                    Select all available
                  </button>
                  <button
                    type="button"
                    className="forge-btn forge-btn--secondary"
                    onClick={() => setBulkOpen("disable")}
                  >
                    Clear optional modules
                  </button>
                </div>

                {[...grouped.entries()].map(([category, rows]) => (
                  <div key={category} className={localStyles.category}>
                    <h3>{category}</h3>
                    <ul className={localStyles.moduleList}>
                      {rows.map((row) => {
                        const ready = row.implementationStatus === "READY";
                        return (
                          <li key={row.id}>
                            <div className={localStyles.moduleRow}>
                              <span>
                                <strong>{row.name}</strong>
                                <StatusBadge
                                  tone={
                                    row.implementationStatus === "READY" ? "success" : "neutral"
                                  }
                                >
                                  {catalogAvailabilityLabel(row.implementationStatus)}
                                </StatusBadge>
                              </span>
                              <label>
                                <span className={localStyles.srOnly}>Enable {row.name}</span>
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft[row.code])}
                                  disabled={!ready || saving}
                                  onChange={(e) => {
                                    setDraft((prev) => ({
                                      ...prev,
                                      [row.code]: e.target.checked,
                                    }));
                                    setDirty(true);
                                  }}
                                />
                              </label>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {productModules.length === 0 ? (
                  <EmptyState
                    title="No seeded modules for this product"
                    description="The platform catalog has no assignable modules for this product yet. Use Industrial Modules for the current Industrial subset, or run catalog seed after migration 0039."
                  />
                ) : null}

                <div className={localStyles.stickySave}>
                  {dirty ? <span>Unsaved changes</span> : <span>All changes saved</span>}
                  <button
                    type="button"
                    className="forge-btn"
                    disabled={!dirty || saving || productModules.length === 0}
                    onClick={() => void saveModules()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      <ConfirmationDialog
        open={bulkOpen === "enable"}
        title="Select all available modules?"
        description="Only ready customer modules already seeded in the platform catalog will be selected."
        confirmLabel="Select all available"
        onCancel={() => setBulkOpen(null)}
        onConfirm={() => applyBulk("enable")}
      />
      <ConfirmationDialog
        open={bulkOpen === "disable"}
        title="Clear optional modules?"
        description="This turns off customer-assignable modules in the draft. Save to apply."
        confirmLabel="Clear optional"
        onCancel={() => setBulkOpen(null)}
        onConfirm={() => applyBulk("disable")}
      />
    </section>
  );
}

export default function CustomerModulesPage() {
  return (
    <PlatformPageGate title="Products & Modules" permission="platform.entitlement.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <CustomerModulesInner />
      </Suspense>
    </PlatformPageGate>
  );
}
