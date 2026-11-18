"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  SearchInput,
  StatusBadge,
} from "@forge/ui";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../app/page.module.css";

type Tenant = {
  id: string;
  tenantKey: string;
  slug: string;
  displayName: string;
  legalName: string;
  status: string;
};

const PAGE_SIZE = 10;

export function TenantPicker({
  targetPath,
  description = "Choose a tenant to continue. Results come from the live platform tenants API.",
}: {
  targetPath: string;
  description?: string;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenants(await apiGet<Tenant[]>("/api/v1/platform/tenants"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter((t) =>
      [t.displayName, t.legalName, t.tenantKey, t.slug].join(" ").toLowerCase().includes(needle),
    );
  }, [tenants, search]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const basePath = targetPath.endsWith("/") ? targetPath : `${targetPath}/`;

  return (
    <>
      <p className={styles.lead}>{description}</p>
      {error ? <ErrorState title="Unable to load tenants" description={error} /> : null}

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tenants…" />
      </FilterBar>

      {loading ? <LoadingState label="Loading tenants…" /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No tenants match"
          description="Adjust your search or create a customer first."
          action={
            <Link className="forge-btn" href="/customers/new/">
              Add customer
            </Link>
          }
        />
      ) : null}

      {pageItems.length > 0 ? (
        <>
          <div className={styles.panel} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <Link href={tenantDetailHref(tenant.id)}>{tenant.displayName}</Link>
                      <div className={styles.muted}>{tenant.tenantKey}</div>
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          tenant.status === "ACTIVE"
                            ? "success"
                            : tenant.status === "SUSPENDED"
                              ? "danger"
                              : "info"
                        }
                      >
                        {tenant.status}
                      </StatusBadge>
                    </td>
                    <td>
                      <Link href={`${basePath}?tenantId=${encodeURIComponent(tenant.id)}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </>
  );
}
