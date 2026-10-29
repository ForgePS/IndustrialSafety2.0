"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@forge/web-kit";
import { FxButton } from "@forge/fx-ui";
import { FeatureGate } from "@/components/feature-gate";
import {
  createCadConnection,
  disableCadConnection,
  enableCadConnection,
  listCadConnections,
  testCadConnection,
  type CadConnection,
} from "@/lib/rms-api";
import { FxActionBar } from "@/fx/forms/FxActionBar";
import { FxTextField } from "@/fx/forms/fields";
import { FxForm, FxFormSection } from "@/fx/forms/FxForm";
import { FxValidationSummary } from "@/fx/forms/FxValidationSummary";
import { ensureFormsRegistered } from "@/fx/forms/register-all";
import { FxTable } from "@/fx/tables/FxTable";
import { FxTableEmpty } from "@/fx/tables/FxTableStates";
import { ensureTablesRegistered } from "@/fx/tables/register-all";
import { useRmsFxCadConnectionsModule } from "@/fx/modules/use-cad-connections-module";
import "@/fx/forms/forms.css";
import styles from "../../page.module.css";

function CadConnectionsInner() {
  const { me } = useAuth();
  const {
    createForm: createFormMode,
    list: listMode,
    loading: moduleFlagLoading,
  } = useRmsFxCadConnectionsModule();
  const [items, setItems] = useState<CadConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("Synthetic CAD");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    ensureFormsRegistered();
    ensureTablesRegistered();
  }, []);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listCadConnections(me.tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!me?.tenantId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createCadConnection(me.tenantId, {
        name: name.trim(),
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "DEVELOPMENT",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      });
      setMessage("Connection created as DRAFT.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(connectionId: string, action: "enable" | "disable" | "test") {
    if (!me?.tenantId) return;
    setError(null);
    setMessage(null);
    try {
      if (action === "enable") await enableCadConnection(me.tenantId, connectionId);
      if (action === "disable") await disableCadConnection(me.tenantId, connectionId);
      if (action === "test") {
        const result = await testCadConnection(me.tenantId, connectionId);
        setMessage(`Test result: ${result.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection action failed");
    }
  }

  const useFxForm = !moduleFlagLoading && createFormMode === "fx";
  const useFxTable = !moduleFlagLoading && listMode === "fx";

  return (
    <FeatureGate flag="cadEnabled" title="CAD Connections">
      <section
        className={styles.page}
        data-testid={
          useFxForm || useFxTable ? "rms-fx-cad-connections" : "rms-legacy-cad-connections"
        }
      >
        <h1>CAD connections</h1>
        <p className={styles.lead}>
          Manage synthetic/dev CAD adapters. Secrets are never displayed; PRODUCTION stays disabled.
        </p>
        {error && !useFxForm ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.success}>{message}</p> : null}

        <div className={styles.panel}>
          <h2>Create synthetic webhook connection</h2>
          {useFxForm ? (
            <FxForm onSubmit={onCreate}>
              {error ? <FxValidationSummary errors={[error]} /> : null}
              <FxFormSection title="Connection">
                <FxTextField
                  id="cad-name"
                  label="Name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </FxFormSection>
              <FxActionBar>
                <FxButton type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create draft"}
                </FxButton>
              </FxActionBar>
            </FxForm>
          ) : (
            <form className={styles.form} onSubmit={onCreate}>
              <div className={styles.formRow}>
                <label htmlFor="cad-name">Name</label>
                <input
                  id="cad-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.button} disabled={submitting}>
                  Create draft
                </button>
              </div>
            </form>
          )}
        </div>

        <div className={styles.panel}>
          <h2>Connections</h2>
          {useFxTable ? (
            <FxTable
              caption="CAD connections"
              loading={loading}
              empty={
                <FxTableEmpty
                  title="No CAD connections."
                  description="Create a draft connection above."
                />
              }
              rows={items}
              rowKey={(row) => row.id}
              columns={[
                { id: "name", header: "Name", accessor: (row) => row.name },
                {
                  id: "publicId",
                  header: "Public ID",
                  accessor: (row) => <span className={styles.mono}>{row.publicId}</span>,
                },
                { id: "status", header: "Status", accessor: (row) => row.status },
                { id: "health", header: "Health", accessor: (row) => row.healthStatus },
              ]}
              rowActions={(row) => (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => void runAction(row.id, "test")}
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => void runAction(row.id, "enable")}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => void runAction(row.id, "disable")}
                  >
                    Disable
                  </button>
                </div>
              )}
            />
          ) : (
            <>
              {loading ? <p className={styles.muted}>Loading…</p> : null}
              {!loading && items.length === 0 ? (
                <p className={styles.muted}>No CAD connections.</p>
              ) : null}
              {items.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Public ID</th>
                      <th>Status</th>
                      <th>Health</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td className={styles.mono}>{row.publicId}</td>
                        <td>{row.status}</td>
                        <td>{row.healthStatus}</td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.buttonSecondary}
                              onClick={() => void runAction(row.id, "test")}
                            >
                              Test
                            </button>
                            <button
                              type="button"
                              className={styles.buttonSecondary}
                              onClick={() => void runAction(row.id, "enable")}
                            >
                              Enable
                            </button>
                            <button
                              type="button"
                              className={styles.buttonSecondary}
                              onClick={() => void runAction(row.id, "disable")}
                            >
                              Disable
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          )}
        </div>
      </section>
    </FeatureGate>
  );
}

export default function CadConnectionsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <CadConnectionsInner />
    </Suspense>
  );
}
