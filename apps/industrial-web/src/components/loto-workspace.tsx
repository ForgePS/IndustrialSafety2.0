"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

type StepForm = {
  energySourceName: string;
  energyMagnitude: string;
  isolationLocationText: string;
  lockoutDeviceName: string;
  isolationAction: string;
  verificationMethodName: string;
};

const emptyStep = (): StepForm => ({
  energySourceName: "",
  energyMagnitude: "",
  isolationLocationText: "",
  lockoutDeviceName: "",
  isolationAction: "",
  verificationMethodName: "",
});

export function LotoWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has("industrial.loto.view") || permissions.has("industrial.admin");
  const canEdit =
    permissions.has("industrial.loto.edit") ||
    permissions.has("industrial.loto.manage") ||
    permissions.has("industrial.loto.create") ||
    permissions.has("industrial.admin");
  const canApprove =
    permissions.has("industrial.loto.approve") || permissions.has("industrial.admin");
  const canPrint =
    permissions.has("industrial.loto.print") ||
    permissions.has("industrial.loto.view") ||
    permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [equipment, setEquipment] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [scope, setScope] = useState("");
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState<StepForm[]>([emptyStep()]);
  const [restorationLabel, setRestorationLabel] = useState("Guards replaced / personnel clear");

  const modEntry = bootstrap?.modules.find((m) => m.code === "LOCKOUT_TAGOUT");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    void apiGet<Bootstrap>("/api/v1/industrial/bootstrap")
      .then(setBootstrap)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Bootstrap failed"));
  }, []);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const [loto, equip] = await Promise.all([
        apiGet<ListResponse>("/api/v1/industrial/loto", {
          query: { q: q || undefined, page: "1", pageSize: "25" },
        }),
        apiGet<ListResponse>("/api/v1/industrial/equipment", {
          query: { page: "1", pageSize: "100" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 100 })),
      ]);
      setItems(loto.items ?? []);
      setEquipment(equip.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load LOTO");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awsReady]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setPrintHtml(null);
    try {
      const data = await apiGet<Record<string, unknown>>(`/api/v1/industrial/loto/${id}`);
      setDetail(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load procedure");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    try {
      const payload = {
        title: title || null,
        equipmentName,
        equipmentId: equipmentId || null,
        scope,
        steps: steps.map((s, i) => ({
          sortOrder: i,
          stepNumber: i + 1,
          ...s,
        })),
        restorationChecks: restorationLabel
          ? [{ sortOrder: 0, checkKey: "clearance", label: restorationLabel, completed: false }]
          : [],
      };
      const created = await apiSend<{ procedure: { id: string } }>(
        "/api/v1/industrial/loto",
        "POST",
        payload,
      );
      setTitle("");
      setEquipmentName("");
      setEquipmentId("");
      setScope("");
      setSteps([emptyStep()]);
      await loadList();
      if (created?.procedure?.id) await openDetail(created.procedure.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  async function transition(path: string, body: Record<string, unknown> = {}) {
    if (!selectedId) return;
    try {
      await apiSend(`/api/v1/industrial/loto/${selectedId}/${path}`, "POST", body);
      await openDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transition failed");
    }
  }

  async function loadPrint() {
    if (!selectedId || !canPrint) return;
    try {
      const data = await apiGet<{ html: string }>(`/api/v1/industrial/loto/${selectedId}/printable`);
      setPrintHtml(data.html);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Printable failed");
    }
  }

  if (!awsReady && bootstrap) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  const procedure = detail?.procedure as Record<string, unknown> | undefined;
  const revision = detail?.revision as Record<string, unknown> | undefined;
  const detailSteps = (detail?.steps as Array<Record<string, unknown>>) ?? [];

  return (
    <section aria-labelledby="loto-title" className="loto-workspace">
      <ModuleWorkspaceHeader
        id="loto-title"
        eyebrow="Operations"
        title={moduleName}
        description="Structured LOTO procedures with ordered energy/isolation/verification steps, restoration, approvals, and revision history. QR runtime not enabled (adapter boundary only)."
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <FilterPanel
        searchId="loto-search"
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Procedure #…"
        chips={q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []}
        onClearAll={() => {
          setQ("");
          void loadList();
        }}
        onSubmit={() => void loadList()}
      />

      {canEdit ? (
        <form className="card border shadow-none mb-4 loto-builder" onSubmit={(e) => void onCreate(e)}>
          <div className="card-header">
            <h6 className="card-title mb-0">Create procedure</h6>
          </div>
          <div className="card-body">
          <label>
            Title
            <input value={title} onChange={(ev) => setTitle(ev.target.value)} />
          </label>
          <label>
            Equipment name *
            <input
              required
              value={equipmentName}
              onChange={(ev) => setEquipmentName(ev.target.value)}
            />
          </label>
          <label>
            Link equipment
            <select
              value={equipmentId}
              onChange={(ev) => {
                const id = ev.target.value;
                setEquipmentId(id);
                const match = equipment.find((x) => String(x.id) === id);
                if (match?.equipmentName) setEquipmentName(String(match.equipmentName));
              }}
            >
              <option value="">— optional —</option>
              {equipment.map((eq) => (
                <option key={String(eq.id)} value={String(eq.id)}>
                  {String(eq.equipmentName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scope
            <textarea value={scope} onChange={(ev) => setScope(ev.target.value)} rows={3} />
          </label>

          <h3>Isolation steps</h3>
          {steps.map((step, idx) => (
            <fieldset key={idx} className="loto-step">
              <legend>Step {idx + 1}</legend>
              <label>
                Energy source *
                <input
                  required
                  value={step.energySourceName}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, energySourceName: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Magnitude
                <input
                  value={step.energyMagnitude}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, energyMagnitude: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Isolation location
                <input
                  value={step.isolationLocationText}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, isolationLocationText: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Lockout device
                <input
                  value={step.lockoutDeviceName}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, lockoutDeviceName: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Lockout method
                <input
                  value={step.isolationAction}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, isolationAction: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Verification
                <input
                  value={step.verificationMethodName}
                  onChange={(ev) =>
                    setSteps((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, verificationMethodName: ev.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              {steps.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove step
                </button>
              ) : null}
            </fieldset>
          ))}
          <button type="button" onClick={() => setSteps((prev) => [...prev, emptyStep()])}>
            Add step
          </button>

          <label>
            Restoration check
            <input
              value={restorationLabel}
              onChange={(ev) => setRestorationLabel(ev.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">Create draft</button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-muted">Loading…</p> : null}
      <div className="card border shadow-none mb-4">
        <div className="list-group list-group-flush">
        {items.map((item) => (
          <button
            key={String(item.id)}
            type="button"
            className="list-group-item list-group-item-action"
            onClick={() => void openDetail(String(item.id))}
          >
            <strong>{String(item.procedureNumber)}</strong> · {String(item.equipmentName)} ·{" "}
            <span className="badge bg-label-secondary">{String(item.status)}</span>
          </button>
        ))}
        </div>
      </div>

      {procedure ? (
        <article className="card border shadow-none loto-detail">
          <div className="card-header">
            <h6 className="card-title mb-0">
              {String(procedure.procedureNumber)} — {String(procedure.status)}
            </h6>
          </div>
          <div className="card-body">
            <p className="text-muted">
              Rev {String(revision?.revisionNumber)} · Equipment {String(procedure.equipmentName)}
            </p>
            <ol>
            {detailSteps.map((s) => (
              <li key={String(s.id)}>
                {String(s.stepNumber)}. {String(s.energySourceName)} @{" "}
                {String(s.isolationLocationText)} — verify {String(s.verificationMethodName)}
              </li>
            ))}
          </ol>
          <div className="d-flex flex-wrap gap-2 loto-actions">
            {canEdit ? (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void transition("submit-review")}>
                Submit review
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void transition("submit-approval")}>
                Submit approval
              </button>
            ) : null}
            {canApprove ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void transition("approve")}>
                Approve
              </button>
            ) : null}
            {canApprove ? (
              <button type="button" className="btn btn-sm btn-success" onClick={() => void transition("activate")}>
                Activate
              </button>
            ) : null}
            {canPrint ? (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void loadPrint()}>
                Printable
              </button>
            ) : null}
          </div>
          {printHtml ? (
            <iframe title="LOTO printable" srcDoc={printHtml} className="loto-print-frame mt-3" />
          ) : null}
          <p className="text-muted small mt-3 mb-0 loto-qr-note">
            Future QR targets: industrial.loto.procedure / industrial.loto.revision (runtime not
            authorized).
          </p>
          </div>
        </article>
      ) : null}
    </section>
  );
}
