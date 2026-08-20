"use client";

import { useCallback, useEffect, useState } from "react";
import { ForgePageHeader, LoadingState } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type LegalDoc = {
  id: string;
  documentKey: string;
  title: string;
  documentType: string;
  status: string;
  tenantId: string | null;
  currentVersionId: string | null;
};

export default function CreatorLegalPage() {
  return (
    <PlatformPageGate
      title="Legal & Compliance"
      anyOf={["platform.audit.read", "platform.feature.manage", "platform.tenant.read"]}
    >
      <LegalInner />
    </PlatformPageGate>
  );
}

function LegalInner() {
  const [items, setItems] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Requires an active tenant context header from Creator session.
      const data = await apiGet<{ items: LegalDoc[] }>("/api/v1/legal/admin/documents?scope=global");
      setItems(data.items ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load global legal documents. Select a tenant context if required.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      <ForgePageHeader
        title="Legal & Compliance"
        description="Forge-global legal documents and acknowledgment configuration. Tenant admins cannot modify Forge Terms or Privacy Notice."
      />
      <p className={styles.muted}>
        Publishing a version that requires re-acknowledgment will gate affected users until they accept
        the new version.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <LoadingState label="Loading legal documents…" />
      ) : (
        <div className={styles.panel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code>{row.documentKey}</code>
                  </td>
                  <td>{row.title}</td>
                  <td>{row.documentType}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4}>No global documents found. Seed Development legal documents first.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
