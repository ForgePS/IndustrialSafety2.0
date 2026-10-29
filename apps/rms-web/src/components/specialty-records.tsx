"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../app/page.module.css";
import {
  archiveSpecialtyRecord,
  createSpecialtyRecord,
  listSpecialtyRecords,
  patchSpecialtyRecord,
  type SpecialtyRecordKind,
} from "@/lib/specialty-api";

type CardState = "loading" | "empty" | "ready" | "saving" | "saved" | "error" | "restricted";

export function SpecialtyRecordsPanel({
  tenantId,
  incidentId,
  kind,
  title,
  createLabel,
  emptyMessage,
  fields,
  canEdit,
}: {
  tenantId: string;
  incidentId: string;
  kind: SpecialtyRecordKind;
  title: string;
  createLabel: string;
  emptyMessage: string;
  fields: { key: string; label: string; type?: "text" | "number" | "boolean" | "textarea" }[];
  canEdit: boolean;
}) {
  const [state, setState] = useState<CardState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const rows = await listSpecialtyRecords(tenantId, incidentId, kind);
      setItems(rows);
      setState(rows.length === 0 ? "empty" : "ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
      setState("error");
    }
  }, [tenantId, incidentId, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate() {
    if (!canEdit) return;
    setState("saving");
    try {
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = draft[field.key];
        if (raw == null || raw === "") continue;
        if (field.type === "number") payload[field.key] = Number(raw);
        else if (field.type === "boolean") payload[field.key] = raw === "true";
        else payload[field.key] = raw;
      }
      await createSpecialtyRecord(tenantId, incidentId, kind, payload);
      setDraft({});
      await reload();
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setState("error");
    }
  }

  async function onArchive(id: string, recordVersion: number) {
    if (!canEdit) return;
    setState("saving");
    try {
      await archiveSpecialtyRecord(tenantId, incidentId, kind, id, recordVersion);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
      setState("error");
    }
  }

  async function onPatch(id: string, recordVersion: number, key: string, value: string) {
    if (!canEdit) return;
    setState("saving");
    try {
      await patchSpecialtyRecord(tenantId, incidentId, kind, id, { [key]: value }, recordVersion);
      await reload();
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setState("error");
    }
  }

  return (
    <div className={styles.panel}>
      <h2>{title}</h2>
      {state === "loading" ? <p className={styles.muted}>Loading…</p> : null}
      {state === "empty" ? <p className={styles.muted}>{emptyMessage}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {state === "restricted" ? (
        <p className={styles.muted}>Restricted — you do not have access to these details.</p>
      ) : null}

      <ul
        style={{ listStyle: "none", padding: 0, margin: "1rem 0", display: "grid", gap: "0.75rem" }}
      >
        {items.map((item) => {
          const id = String(item.id);
          const version = Number(item.recordVersion ?? 1);
          const restricted = Boolean(item.restricted);
          return (
            <li
              key={id}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: "8px",
                padding: "0.75rem",
              }}
            >
              {restricted ? (
                <p className={styles.muted}>Restricted summary — open with authorized access.</p>
              ) : null}
              {fields.map((field) => (
                <div key={field.key} className={styles.formRow}>
                  <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      id={`${id}-${field.key}`}
                      rows={3}
                      disabled={!canEdit || restricted}
                      defaultValue={String(item[field.key] ?? "")}
                      onBlur={(event) => {
                        if (event.target.value !== String(item[field.key] ?? "")) {
                          void onPatch(id, version, field.key, event.target.value);
                        }
                      }}
                    />
                  ) : (
                    <input
                      id={`${id}-${field.key}`}
                      type={field.type === "number" ? "number" : "text"}
                      disabled={!canEdit || restricted}
                      defaultValue={String(item[field.key] ?? "")}
                      onBlur={(event) => {
                        if (event.target.value !== String(item[field.key] ?? "")) {
                          void onPatch(id, version, field.key, event.target.value);
                        }
                      }}
                    />
                  )}
                </div>
              ))}
              {canEdit ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void onArchive(id, version)}
                >
                  Archive
                </button>
              ) : (
                <p className={styles.muted}>Read-only</p>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit ? (
        <div className={styles.form}>
          <h3>{createLabel}</h3>
          {fields.slice(0, 4).map((field) => (
            <div key={field.key} className={styles.formRow}>
              <label htmlFor={`new-${field.key}`}>{field.label}</label>
              <input
                id={`new-${field.key}`}
                value={draft[field.key] ?? ""}
                onChange={(event) => setDraft((d) => ({ ...d, [field.key]: event.target.value }))}
              />
            </div>
          ))}
          <button type="button" onClick={() => void onCreate()}>
            Add
          </button>
          {state === "saving" ? <p className={styles.muted}>Saving…</p> : null}
          {state === "saved" ? <p className={styles.muted}>Saved</p> : null}
        </div>
      ) : null}
    </div>
  );
}
