"use client";

import { useCallback, useEffect, useState } from "react";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
import { NerisPageShell } from "@/components/neris-schema-gate";
import { apiGet } from "@/lib/api";
import styles from "../../page.module.css";

type ModuleRow = {
  id: string;
  moduleKey: string;
  name: string;
  area: string | null;
  fieldCount: number;
  sourceWorkbook: string | null;
};

export default function NerisModulesPage() {
  const [items, setItems] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<ModuleRow[]>("/api/v1/platform/neris/modules?pageSize=100"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = sortByField(
    filterBySearch(items, search, [(r) => r.moduleKey, (r) => r.name, (r) => r.area ?? ""]),
    "moduleKey",
    { moduleKey: (r) => r.moduleKey },
  );
  const pageItems = paginate(filtered, page, 20);

  return (
    <NerisPageShell title="NERIS modules" subtitle="Browse the 39 official schema modules.">
      {loading ? <p>Loading…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <ListControls
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        sort="moduleKey"
        sortOptions={[{ value: "moduleKey", label: "Key" }]}
        onSortChange={() => undefined}
        page={page}
        pageSize={20}
        total={filtered.length}
        onPageChange={setPage}
      />
      {!loading && !error && filtered.length === 0 ? <p>No modules match.</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Area</th>
              <th>Fields</th>
              <th>Workbook</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.moduleKey}</code>
                </td>
                <td>{row.name}</td>
                <td>{row.area ?? "—"}</td>
                <td>{row.fieldCount}</td>
                <td>{row.sourceWorkbook ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NerisPageShell>
  );
}
