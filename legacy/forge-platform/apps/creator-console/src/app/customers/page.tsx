"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  ForgePageActions,
  ForgePageHeader,
  LoadingState,
  Pagination,
  SearchInput,
  StatusBadge,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import { customerStatusTone, humanCustomerStatus, unavailableLabel } from "@/lib/presentation";
import styles from "../page.module.css";

type Tenant = {
  id: string;
  tenantKey: string;
  slug: string;
  displayName: string;
  legalName: string;
  status: string;
  tenantType: string;
  createdAt?: string;
  updatedAt?: string;
  primaryDomain?: string | null;
};

const PAGE_SIZE = 10;

function CustomersInner() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenants(await apiGet<Tenant[]>("/api/v1/platform/tenants"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load your customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (!needle) return true;
      return [t.displayName, t.legalName, t.slug, t.primaryDomain ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [tenants, search, statusFilter]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Companies"
        subtitle="Manage every organization using Forge."
        actions={
          <ForgePageActions>
            <Link className="forge-btn" href="/onboarding/new/">
              + Add Company
            </Link>
          </ForgePageActions>
        }
      />

      {error ? (
        <ErrorState
          title="We couldn't load your companies"
          description={error}
          action={
            <button type="button" className="forge-btn" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      ) : null}

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search companies…" />
        <label className="forge-search-input" htmlFor="status-filter">
          <span className="forge-search-input__label">Status</span>
          <select
            id="status-filter"
            className="forge-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="TRIAL">Trial</option>
            <option value="ONBOARDING">Onboarding</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
      </FilterBar>

      {loading ? <LoadingState label="Loading companies…" /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title={tenants.length === 0 ? "No companies yet" : "No companies match"}
          description={
            tenants.length === 0
              ? "Add a company to begin guided onboarding."
              : "Adjust filters or add a new company."
          }
          action={
            <Link className="forge-btn" href="/onboarding/new/">
              Add Company
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
                  <th>Company</th>
                  <th>Status</th>
                  <th>Web address</th>
                  <th>Last activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <Link href={tenantDetailHref(tenant.id)}>{tenant.displayName}</Link>
                      {tenant.legalName && tenant.legalName !== tenant.displayName ? (
                        <div className={styles.muted}>{tenant.legalName}</div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge tone={customerStatusTone(tenant.status)}>
                        {humanCustomerStatus(tenant.status)}
                      </StatusBadge>
                    </td>
                    <td>{tenant.primaryDomain ?? `${tenant.slug}.forgepublicsafety.com`}</td>
                    <td>
                      {tenant.updatedAt
                        ? new Date(tenant.updatedAt).toLocaleDateString()
                        : unavailableLabel()}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Link href={tenantDetailHref(tenant.id)}>Open</Link>
                        <Link href={`${tenantDetailHref(tenant.id)}&tab=users`}>Users</Link>
                        <Link href={`${tenantDetailHref(tenant.id)}&tab=products`}>Products</Link>
                        <Link href="/migrations/">Migration</Link>
                      </div>
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
    </section>
  );
}

export default function CustomersPage() {
  return (
    <PlatformPageGate title="Customers" permission="platform.tenant.read">
      <CustomersInner />
    </PlatformPageGate>
  );
}
