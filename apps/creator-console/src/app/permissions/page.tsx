"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
};

const PAGE_SIZE = 15;

function PermissionsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("platform.permission.read");

  const [items, setItems] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<Permission[]>(`/api/v1/tenants/${tenantId}/permissions`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const filtered = useMemo(() => {
    const searched = filterBySearch(items, search, [
      (row) => row.code,
      (row) => row.name,
      (row) => row.category ?? "",
    ]);
    return sortByField(searched, sort, {
      code: (row) => row.code,
      name: (row) => row.name,
      category: (row) => row.category ?? "",
    });
  }, [items, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Permissions</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Permissions</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/roles${tenantQuery(tenantId)}`}>Roles</Link>
      </p>

      {!canRead ? (
        <p className={styles.error}>Missing permission: platform.permission.read</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>Permission catalog</h2>
        {canRead ? (
          <ListControls
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            sortOptions={[
              { value: "code", label: "Code" },
              { value: "name", label: "Name" },
              { value: "category", label: "Category" },
            ]}
            onSortChange={setSort}
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        ) : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && canRead && filtered.length === 0 ? (
          <p className={styles.muted}>No permissions found.</p>
        ) : null}
        {canRead && pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.category ?? "—"}</td>
                  <td>{row.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function PermissionsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <PermissionsInner />
    </Suspense>
  );
}
