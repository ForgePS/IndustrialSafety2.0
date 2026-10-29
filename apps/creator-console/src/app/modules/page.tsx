"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FORGE_PLATFORMS, catalogAvailabilityLabel } from "@forge/contracts";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  ForgePageHeader,
  LoadingState,
  SearchInput,
  StatusBadge,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { CatalogModuleManager } from "@/components/catalog-module-manager";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";
import catalogStyles from "./modules.module.css";

type CatalogModule = {
  id: string;
  code: string;
  name: string;
  status?: string;
  productCode: string;
  productName: string;
  platformKey?: string | null;
  category: string;
  classification: string;
  implementationStatus: string;
  availabilityLabel: string;
  customerAssignable: boolean;
  customerAssignmentCount: number;
  isCore: boolean;
};

type PlatformTab = "ALL" | "INDUSTRIAL" | "RMS" | "ACADEMY";

const TABS: Array<{ id: PlatformTab; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "INDUSTRIAL", label: "Industrial Safety" },
  { id: "RMS", label: "RMS" },
  { id: "ACADEMY", label: "Academy" },
];

function ModulesInner() {
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<PlatformTab>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [assignableOnly, setAssignableOnly] = useState(true);
  const [advancedId, setAdvancedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModules(await apiGet<CatalogModule[]>("/api/v1/platform/modules"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerFacing = useMemo(
    () =>
      modules.filter((row) => {
        if (row.productCode === "FORGE_CREATOR") return false;
        if (row.classification === "PLATFORM_CORE" || row.classification === "INTERNAL_TOOL") {
          return false;
        }
        return true;
      }),
    [modules],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return customerFacing
      .filter((row) => {
        if (tab !== "ALL") {
          const platform = FORGE_PLATFORMS.find((p) => p.key === tab);
          if (!platform || row.productCode !== platform.productCode) return false;
        }
        if (assignableOnly && !row.customerAssignable) return false;
        if (statusFilter !== "ALL" && row.implementationStatus !== statusFilter) return false;
        if (!needle) return true;
        return [row.code, row.name, row.category, row.productName]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (a, b) =>
          a.productName.localeCompare(b.productName) ||
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name),
      );
  }, [customerFacing, search, tab, assignableOnly, statusFilter]);

  const grouped = useMemo(() => {
    const byPlatform = new Map<string, Map<string, CatalogModule[]>>();
    for (const row of filtered) {
      const platformName = row.productName;
      if (!byPlatform.has(platformName)) byPlatform.set(platformName, new Map());
      const cats = byPlatform.get(platformName)!;
      if (!cats.has(row.category)) cats.set(row.category, []);
      cats.get(row.category)!.push(row);
    }
    return byPlatform;
  }, [filtered]);

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Module Catalog"
        subtitle="Customer modules grouped by Forge platform. Use catalog management to add or edit module records."
      />

      <CatalogModuleManager />

      {error ? <ErrorState title="Unable to load modules" description={error} /> : null}

      <div className={catalogStyles.tabs} role="tablist" aria-label="Platform">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? catalogStyles.tabActive : catalogStyles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search modules…" />
        <label className={catalogStyles.filterLabel}>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={catalogStyles.select}
          >
            <option value="ALL">All</option>
            <option value="READY">Ready</option>
            <option value="MIGRATING">Migrating</option>
            <option value="COMING_SOON">Coming soon</option>
            <option value="UNAVAILABLE">Not available</option>
          </select>
        </label>
        <label className={catalogStyles.checkLabel}>
          <input
            type="checkbox"
            checked={assignableOnly}
            onChange={(e) => setAssignableOnly(e.target.checked)}
          />
          Assignable only
        </label>
      </FilterBar>

      {loading ? <LoadingState label="Loading modules…" /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No modules found"
          description="Adjust filters or check the platform catalog seed."
        />
      ) : null}

      {[...grouped.entries()].map(([platformName, categories]) => (
        <section key={platformName} className={catalogStyles.platformSection}>
          <h2 className={catalogStyles.platformTitle}>{platformName}</h2>
          {[...categories.entries()].map(([category, rows]) => (
            <div key={category} className={catalogStyles.categoryBlock}>
              <h3 className={catalogStyles.categoryTitle}>{category}</h3>
              <div className={catalogStyles.cardGrid}>
                {rows.map((row) => (
                  <article key={row.id} className={catalogStyles.card}>
                    <div className={catalogStyles.cardHead}>
                      <h4>{row.name}</h4>
                      <StatusBadge
                        tone={
                          row.implementationStatus === "READY"
                            ? "success"
                            : row.implementationStatus === "MIGRATING"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {row.availabilityLabel}
                      </StatusBadge>
                    </div>
                    <p className={catalogStyles.meta}>
                      {row.customerAssignmentCount} customer
                      {row.customerAssignmentCount === 1 ? "" : "s"}
                    </p>
                    <div className={catalogStyles.cardActions}>
                      <button
                        type="button"
                        className="forge-btn forge-btn--secondary"
                        onClick={() => setAdvancedId((cur) => (cur === row.id ? null : row.id))}
                      >
                        {advancedId === row.id ? "Hide details" : "Advanced details"}
                      </button>
                    </div>
                    {advancedId === row.id ? (
                      <dl className={catalogStyles.advanced}>
                        <div>
                          <dt>Key</dt>
                          <dd>{row.code}</dd>
                        </div>
                        <div>
                          <dt>Platform</dt>
                          <dd>{row.productCode}</dd>
                        </div>
                        <div>
                          <dt>Classification</dt>
                          <dd>{row.classification}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {catalogAvailabilityLabel(row.implementationStatus)} (
                            {row.implementationStatus})
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}

export default function ModulesPage() {
  return (
    <PlatformPageGate title="Modules" permission="platform.entitlement.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ModulesInner />
      </Suspense>
    </PlatformPageGate>
  );
}
