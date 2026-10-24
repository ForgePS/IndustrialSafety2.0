"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmationDialog, ForgePageHeader, LoadingState } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantPicker } from "@/components/tenant-picker";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type EffectiveFeature = {
  key: string;
  name: string;
  value: unknown;
  valueType: string;
};

function FeaturesInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [features, setFeatures] = useState<EffectiveFeature[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [featureKey, setFeatureKey] = useState("");
  const [valueText, setValueText] = useState("true");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<EffectiveFeature[]>(
        `/api/v1/tenants/${tenantId}/features/effective`,
      );
      setFeatures(rows);
      setFeatureKey((current) => current || rows[0]?.key || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load features");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function putOverride() {
    if (!tenantId || !featureKey) return;
    setSubmitting(true);
    setError(null);
    try {
      let value: unknown = valueText;
      try {
        value = JSON.parse(valueText) as unknown;
      } catch {
        // treat as plain string
      }
      await apiSend(`/api/v1/tenants/${tenantId}/features/${featureKey}`, "PUT", {
        value,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      setConfirmOpen(false);
      const rows = await apiGet<EffectiveFeature[]>(
        `/api/v1/tenants/${tenantId}/features/effective`,
      );
      setFeatures(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to put feature override");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function onOverrideRequest(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !featureKey) return;
    setConfirmOpen(true);
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Features"
          subtitle="View effective feature flags and apply tenant overrides."
        />
        <TenantPicker
          targetPath="/features"
          description="Select a tenant before viewing or overriding feature flags."
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <ForgePageHeader title="Features" subtitle={`Tenant ${tenantId}`} />
      <p className={styles.lead}>
        <Link href={tenantDetailHref(tenantId)}>Tenant detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>Put tenant override</h2>
        <form className={styles.form} onSubmit={onOverrideRequest}>
          <div className={styles.formRow}>
            <label htmlFor="featureKey">Feature key</label>
            <select
              id="featureKey"
              value={featureKey}
              onChange={(e) => setFeatureKey(e.target.value)}
              required
            >
              {features.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.key} — {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="valueText">Value (JSON or string)</label>
            <input
              id="valueText"
              required
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="reason">Reason (optional)</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              Put override
            </button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        open={confirmOpen}
        title="Apply feature override?"
        description={
          <>
            This calls{" "}
            <code>
              PUT /api/v1/tenants/{tenantId}/features/{featureKey || "…"}
            </code>{" "}
            with value <code>{valueText}</code>
            {reason.trim() ? <> and reason &ldquo;{reason.trim()}&rdquo;.</> : "."}
          </>
        }
        confirmLabel="Apply override"
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void putOverride()}
      />

      <div className={styles.panel}>
        <h2>Effective features</h2>
        {loading ? <LoadingState label="Loading features…" /> : null}
        {!loading && features.length === 0 ? (
          <p className={styles.muted}>No feature definitions.</p>
        ) : null}
        {features.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.key}>
                  <td className={styles.mono}>{f.key}</td>
                  <td>{f.name}</td>
                  <td>{f.valueType}</td>
                  <td className={styles.mono}>{JSON.stringify(f.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <PlatformPageGate title="Feature Flags" permission="platform.feature.manage">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <FeaturesInner />
      </Suspense>
    </PlatformPageGate>
  );
}
