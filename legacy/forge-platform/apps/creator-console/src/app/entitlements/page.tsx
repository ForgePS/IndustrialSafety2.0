"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { ForgePageHeader, LoadingState } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantPicker } from "@/components/tenant-picker";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type ProductEntitlement = {
  id: string;
  status: string;
  productCode: string;
  productName: string;
};

type ModuleEntitlement = {
  id: string;
  status: string;
  moduleCode: string;
  moduleName: string;
};

type EntitlementsPayload = {
  products: ProductEntitlement[];
  modules: ModuleEntitlement[];
};

type CatalogProduct = { id: string; code: string; name: string };
type CatalogModule = { id: string; code: string; name: string };

function EntitlementsInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [data, setData] = useState<EntitlementsPayload | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogModules, setCatalogModules] = useState<CatalogModule[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [productCode, setProductCode] = useState("");
  const [productStatus, setProductStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [moduleCode, setModuleCode] = useState("");
  const [moduleStatus, setModuleStatus] = useState<"ACTIVE" | "PENDING" | "SUSPENDED" | "GRACE">(
    "ACTIVE",
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [entitlements, products, modules] = await Promise.all([
        apiGet<EntitlementsPayload>(`/api/v1/tenants/${tenantId}/entitlements`),
        apiGet<CatalogProduct[]>("/api/v1/platform/products"),
        apiGet<CatalogModule[]>("/api/v1/platform/modules"),
      ]);
      setData(entitlements);
      setCatalogProducts(products);
      setCatalogModules(modules);
      setProductCode((current) => current || products[0]?.code || "");
      setModuleCode((current) => current || modules[0]?.code || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entitlements");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function putProduct(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !productCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/products/${productCode}`, "PUT", {
        status: productStatus,
      });
      const entitlements = await apiGet<EntitlementsPayload>(
        `/api/v1/tenants/${tenantId}/entitlements`,
      );
      setData(entitlements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to put product entitlement");
    } finally {
      setSubmitting(false);
    }
  }

  async function putModule(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !moduleCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/modules/${moduleCode}/entitlement`, "PUT", {
        status: moduleStatus,
      });
      const entitlements = await apiGet<EntitlementsPayload>(
        `/api/v1/tenants/${tenantId}/entitlements`,
      );
      setData(entitlements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to put module entitlement");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Product Access"
          subtitle="Choose a customer before editing which products and modules they can use."
        />
        <TenantPicker
          targetPath="/entitlements"
          description="Select a tenant before editing entitlements. Avoids loading an unusable cross-tenant grid."
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Product Access"
        subtitle="Products and modules enabled for this customer."
      />
      <p className={styles.lead}>
        <Link href={tenantDetailHref(tenantId)}>Tenant detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <LoadingState label="Loading entitlements…" /> : null}

      <div className={styles.panel}>
        <h2>Put product entitlement</h2>
        <form className={styles.form} onSubmit={putProduct}>
          <div className={styles.formRow}>
            <label htmlFor="productCode">Product</label>
            <select
              id="productCode"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              required
            >
              {catalogProducts.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="productStatus">Status</label>
            <select
              id="productStatus"
              value={productStatus}
              onChange={(e) => setProductStatus(e.target.value as "ACTIVE" | "DISABLED")}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              Put product
            </button>
          </div>
        </form>
      </div>

      <div className={styles.panel}>
        <h2>Put module entitlement</h2>
        <form className={styles.form} onSubmit={putModule}>
          <div className={styles.formRow}>
            <label htmlFor="moduleCode">Module</label>
            <select
              id="moduleCode"
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value)}
              required
            >
              {catalogModules.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="moduleStatus">Status</label>
            <select
              id="moduleStatus"
              value={moduleStatus}
              onChange={(e) =>
                setModuleStatus(e.target.value as "ACTIVE" | "PENDING" | "SUSPENDED" | "GRACE")
              }
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="GRACE">GRACE</option>
            </select>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              Put module
            </button>
          </div>
        </form>
      </div>

      {data ? (
        <>
          <div className={styles.panel}>
            <h2>Product entitlements</h2>
            {data.products.length === 0 ? (
              <p className={styles.muted}>None</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.mono}>{row.productCode}</td>
                      <td>{row.productName}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.panel}>
            <h2>Module entitlements</h2>
            {data.modules.length === 0 ? (
              <p className={styles.muted}>None</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modules.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.mono}>{row.moduleCode}</td>
                      <td>{row.moduleName}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function EntitlementsPage() {
  return (
    <PlatformPageGate title="Product Access" permission="platform.entitlement.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <EntitlementsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
