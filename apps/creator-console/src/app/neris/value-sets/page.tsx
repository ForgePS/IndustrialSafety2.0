"use client";

import { useCallback, useEffect, useState } from "react";
import { ListControls } from "@/components/list-controls";
import { NerisPageShell } from "@/components/neris-schema-gate";
import { apiGet } from "@/lib/api";
import styles from "../../page.module.css";

type ValueSet = {
  id: string;
  sourceKey: string;
  name: string;
  sourceWorkbook: string | null;
  optionCount: number;
};

export default function NerisValueSetsPage() {
  const [items, setItems] = useState<ValueSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<
    Array<{ id: string; code: string; description: string | null; active: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (search) params.set("search", search);
      setItems(await apiGet<ValueSet[]>(`/api/v1/platform/neris/value-sets?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load value sets");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOptions = useCallback(async (valueSetId: string) => {
    setSelectedId(valueSetId);
    setOptions(
      await apiGet(
        `/api/v1/platform/neris/value-sets/${valueSetId}/options?pageSize=100&includeInactive=true`,
      ),
    );
  }, []);

  return (
    <NerisPageShell
      title="NERIS value sets"
      subtitle="Namespaced by source_key so similarly named tables stay separate."
    >
      {loading ? <p>Loading…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <ListControls
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        sort="sourceKey"
        sortOptions={[{ value: "sourceKey", label: "Source key" }]}
        onSortChange={() => undefined}
        page={page}
        pageSize={25}
        total={items.length}
        onPageChange={setPage}
      />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Source key</th>
              <th>Name</th>
              <th>Options</th>
              <th>Workbook</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.sourceKey}</code>
                </td>
                <td>{row.name}</td>
                <td>{row.optionCount}</td>
                <td>{row.sourceWorkbook ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => void loadOptions(row.id)}>
                    Options
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedId ? (
        <>
          <h2>Options (inactive preserved, not selectable for new records when active=false)</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {options.map((opt) => (
                  <tr key={opt.id}>
                    <td>
                      <code>{opt.code}</code>
                    </td>
                    <td>{opt.description ?? "—"}</td>
                    <td>{opt.active ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </NerisPageShell>
  );
}
