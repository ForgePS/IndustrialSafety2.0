"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@forge/web-kit";
import { FxButton } from "@forge/fx-ui";
import { FeatureGate } from "@/components/feature-gate";
import {
  getTenantNerisConfiguration,
  listFieldOverlays,
  putFieldOverlay,
  putTenantNerisConfiguration,
  type FieldOverlay,
  type TenantNerisConfiguration,
} from "@/lib/rms-api";
import { FxActionBar } from "@/fx/forms/FxActionBar";
import { FxCheckbox, FxNumberField, FxSelect, FxTextarea, FxTextField } from "@/fx/forms/fields";
import { FxForm, FxFormSection } from "@/fx/forms/FxForm";
import { FxValidationSummary } from "@/fx/forms/FxValidationSummary";
import { ensureFormsRegistered } from "@/fx/forms/register-all";
import { useRmsFxNerisConfigurationModule } from "@/fx/modules/use-neris-configuration-module";
import "@/fx/forms/forms.css";
import styles from "../page.module.css";

function ConfigurationInner() {
  const { me } = useAuth();
  const { forms: formsMode, loading: moduleFlagLoading } = useRmsFxNerisConfigurationModule();
  const [config, setConfig] = useState<TenantNerisConfiguration | null>(null);
  const [overlays, setOverlays] = useState<FieldOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [helpText, setHelpText] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    ensureFormsRegistered();
  }, []);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [configuration, fieldOverlays] = await Promise.all([
        getTenantNerisConfiguration(me.tenantId),
        listFieldOverlays(me.tenantId),
      ]);
      setConfig(configuration);
      setOverlays(fieldOverlays);
      setSelectedFieldId((current) => current || fieldOverlays[0]?.fieldId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const overlay = overlays.find((row) => row.fieldId === selectedFieldId);
    setDisplayLabel(overlay?.displayLabel ?? "");
    setHelpText(overlay?.helpText ?? "");
    setDisplayOrder(overlay?.displayOrder != null ? String(overlay.displayOrder) : "");
    setFavorite(Boolean(overlay?.favorite));
  }, [selectedFieldId, overlays]);

  async function onSaveConfig(event: FormEvent) {
    event.preventDefault();
    if (!me?.tenantId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await putTenantNerisConfiguration(me.tenantId, {
        operatingMode: "MANUAL_ONLY",
        status: config?.status ?? "ACTIVE",
      });
      setConfig(updated);
      setMessage("Tenant configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveOverlay(event: FormEvent) {
    event.preventDefault();
    if (!me?.tenantId || !selectedFieldId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await putFieldOverlay(me.tenantId, {
        fieldId: selectedFieldId,
        displayLabel: displayLabel.trim() || null,
        helpText: helpText.trim() || null,
        displayOrder: displayOrder ? Number(displayOrder) : null,
        favorite,
      });
      setMessage("Field overlay saved. Official NERIS codes were not modified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save field overlay");
    } finally {
      setSubmitting(false);
    }
  }

  const useFx = !moduleFlagLoading && formsMode === "fx";

  const fieldOptions = useMemo(() => {
    const options = overlays.map((overlay) => ({
      value: overlay.fieldId,
      label: overlay.displayLabel ?? overlay.localAlias ?? overlay.fieldId,
    }));
    if (selectedFieldId && !options.some((opt) => opt.value === selectedFieldId)) {
      options.push({ value: selectedFieldId, label: selectedFieldId });
    }
    return options;
  }, [overlays, selectedFieldId]);

  return (
    <FeatureGate flag="tenantConfiguration" title="Configuration">
      <section
        className={styles.page}
        data-testid={useFx ? "rms-fx-neris-configuration" : "rms-legacy-neris-configuration"}
      >
        <h1>NERIS configuration</h1>
        <p className={styles.lead}>
          Customize labels, help text, favorites, order, and visibility. Official NERIS codes and
          value-set definitions remain read-only.
        </p>

        {error && !useFx ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.success}>{message}</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}

        <div className={styles.panel}>
          <h2>Operating mode</h2>
          {useFx ? (
            <FxForm onSubmit={onSaveConfig}>
              {error ? <FxValidationSummary errors={[error]} /> : null}
              <FxFormSection title="Tenant operating mode">
                <p className={styles.muted}>
                  Current mode: <strong>{config?.operatingMode ?? "MANUAL_ONLY"}</strong>
                </p>
                <p className={styles.warning}>
                  Local validation warnings and tenant defaults may be configured here. Do not edit
                  official code lists.
                </p>
              </FxFormSection>
              <FxActionBar>
                <FxButton type="submit" tone="secondary" disabled={submitting}>
                  Save tenant configuration
                </FxButton>
              </FxActionBar>
            </FxForm>
          ) : (
            <form className={styles.form} onSubmit={onSaveConfig}>
              <p className={styles.muted}>
                Current mode: <strong>{config?.operatingMode ?? "MANUAL_ONLY"}</strong>
              </p>
              <p className={styles.warning}>
                Local validation warnings and tenant defaults may be configured here. Do not edit
                official code lists.
              </p>
              <button className={styles.buttonSecondary} type="submit" disabled={submitting}>
                Save tenant configuration
              </button>
            </form>
          )}
        </div>

        <div className={styles.panel}>
          <h2>Field overlays</h2>
          {overlays.length === 0 ? (
            <p className={styles.muted}>
              No field overlays yet. Save an overlay to customize a field.
            </p>
          ) : null}
          {useFx ? (
            <FxForm onSubmit={onSaveOverlay}>
              {error ? <FxValidationSummary errors={[error]} /> : null}
              <FxFormSection title="Overlay">
                {fieldOptions.length > 0 ? (
                  <FxSelect
                    id="fieldId"
                    label="Field"
                    value={selectedFieldId}
                    onChange={(event) => setSelectedFieldId(event.target.value)}
                    options={fieldOptions}
                  />
                ) : null}
                {!selectedFieldId ? (
                  <FxTextField
                    id="newFieldId"
                    label="Field ID (UUID)"
                    value={selectedFieldId}
                    onChange={(event) => setSelectedFieldId(event.target.value)}
                    placeholder="Paste a NERIS field UUID"
                  />
                ) : null}
                <FxTextField
                  id="displayLabel"
                  label="Display label"
                  value={displayLabel}
                  onChange={(event) => setDisplayLabel(event.target.value)}
                />
                <FxTextarea
                  id="helpText"
                  label="Help text"
                  rows={3}
                  value={helpText}
                  onChange={(event) => setHelpText(event.target.value)}
                />
                <FxNumberField
                  id="displayOrder"
                  label="Display order"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value)}
                />
                <FxCheckbox
                  id="favorite"
                  label="Favorite"
                  checked={favorite}
                  onChange={(event) => setFavorite(event.target.checked)}
                />
              </FxFormSection>
              <FxActionBar>
                <FxButton type="submit" disabled={submitting || !selectedFieldId}>
                  Save field overlay
                </FxButton>
              </FxActionBar>
            </FxForm>
          ) : (
            <form className={styles.form} onSubmit={onSaveOverlay}>
              <div className={styles.formRow}>
                <label htmlFor="fieldId">Field</label>
                <select
                  id="fieldId"
                  value={selectedFieldId}
                  onChange={(event) => setSelectedFieldId(event.target.value)}
                >
                  {overlays.map((overlay) => (
                    <option key={overlay.fieldId} value={overlay.fieldId}>
                      {overlay.displayLabel ?? overlay.localAlias ?? overlay.fieldId}
                    </option>
                  ))}
                  {!overlays.some((overlay) => overlay.fieldId === selectedFieldId) &&
                  selectedFieldId ? (
                    <option value={selectedFieldId}>{selectedFieldId}</option>
                  ) : null}
                </select>
              </div>
              {!selectedFieldId ? (
                <div className={styles.formRow}>
                  <label htmlFor="newFieldId">Field ID (UUID)</label>
                  <input
                    id="newFieldId"
                    value={selectedFieldId}
                    onChange={(event) => setSelectedFieldId(event.target.value)}
                    placeholder="Paste a NERIS field UUID"
                  />
                </div>
              ) : null}
              <div className={styles.formRow}>
                <label htmlFor="displayLabel">Display label</label>
                <input
                  id="displayLabel"
                  value={displayLabel}
                  onChange={(event) => setDisplayLabel(event.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="helpText">Help text</label>
                <textarea
                  id="helpText"
                  rows={3}
                  value={helpText}
                  onChange={(event) => setHelpText(event.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="displayOrder">Display order</label>
                <input
                  id="displayOrder"
                  type="number"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="favorite">
                  <input
                    id="favorite"
                    type="checkbox"
                    checked={favorite}
                    onChange={(event) => setFavorite(event.target.checked)}
                  />{" "}
                  Favorite
                </label>
              </div>
              <button
                className={styles.button}
                type="submit"
                disabled={submitting || !selectedFieldId}
              >
                Save field overlay
              </button>
            </form>
          )}
        </div>
      </section>
    </FeatureGate>
  );
}

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <ConfigurationInner />
    </Suspense>
  );
}
