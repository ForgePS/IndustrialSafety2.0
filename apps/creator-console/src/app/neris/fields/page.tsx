"use client";

import { useCallback, useEffect, useState } from "react";
import { ListControls } from "@/components/list-controls";
import { NerisPageShell } from "@/components/neris-schema-gate";
import { apiGet } from "@/lib/api";
import styles from "../../page.module.css";

type FieldRow = {
  id: string;
  fieldKey: string;
  dataType: string | null;
  cardinality: string | null;
  valueSetLocation: string | null;
  officialRequired: boolean;
  computed: boolean;
  ordinal: number;
};

export default function NerisFieldsPage() {
  const [items, setItems] = useState<FieldRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);
      const result = await apiGet<FieldRow[]>(`/api/v1/platform/neris/fields?${params}`, {
        // meta pagination returned separately via raw fetch if needed
      });
      setItems(result);
      // apiGet may not expose meta; approximate when searching server-side
      setTotal(
        result.length < pageSize && page === 1
          ? result.length
          : Math.max(result.length, page * pageSize),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fields");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NerisPageShell
      title="NERIS fields"
      subtitle="Official field keys are immutable after publish."
    >
      {loading ? <p>Loading…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <ListControls
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        sort="fieldKey"
        sortOptions={[{ value: "fieldKey", label: "Key" }]}
        onSortChange={() => undefined}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Type</th>
              <th>Cardinality</th>
              <th>Value set</th>
              <th>Required</th>
              <th>Computed</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.fieldKey}</code>
                </td>
                <td>{row.dataType ?? "—"}</td>
                <td>{row.cardinality ?? "—"}</td>
                <td>{row.valueSetLocation ?? "—"}</td>
                <td>{row.officialRequired ? "yes" : "no"}</td>
                <td>{row.computed ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NerisPageShell>
  );
}
