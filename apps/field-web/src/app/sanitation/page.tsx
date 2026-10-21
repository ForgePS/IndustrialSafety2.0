"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FoodSafetyBanner } from "@/components/food-safety-banner";
import { OfflineBanner, useNetworkStatus } from "@/components/offline-banner";
import { SanitationChecklistRunner } from "@/components/sanitation-checklist-runner";
import { fieldAuthOpts, hasFieldPermission } from "@/lib/field-permissions";
import {
  enqueueSanitationMutation,
  flushSanitationQueue,
  questionsFromTemplateJson,
  sanitationPendingCount,
  sanitationSend,
  saveSanitationDraft,
  type SanitationDraft,
} from "@/lib/sanitation-offline";

const API = "/api/v1/industrial/sanitation";

type CleaningTask = {
  id: string;
  title?: string | null;
  status?: string | null;
  dueAt?: string | null;
  taskNumber?: string | null;
};

type SiteRow = { id: string; name?: string | null; label?: string | null };

type TemplateRow = {
  id: string;
  name?: string | null;
  code?: string | null;
  category?: string | null;
  templateJson?: unknown;
};

type ConcernType =
  | "DUST"
  | "GRAIN_SPILL"
  | "PEST"
  | "CHEMICAL"
  | "TRASH"
  | "EQUIPMENT"
  | "WATER"
  | "DRAIN"
  | "FOOD_CONTAMINATION"
  | "FOREIGN_MATERIAL"
  | "EMPLOYEE_GMP"
  | "GROUNDS"
  | "OTHER";

const CONCERN_OPTIONS: Array<{ id: ConcernType; label: string }> = [
  { id: "DUST", label: "Dust" },
  { id: "GRAIN_SPILL", label: "Grain Spill" },
  { id: "PEST", label: "Pest" },
  { id: "CHEMICAL", label: "Chemical" },
  { id: "TRASH", label: "Trash" },
  { id: "EQUIPMENT", label: "Equipment" },
  { id: "WATER", label: "Water" },
  { id: "DRAIN", label: "Drain" },
  { id: "FOOD_CONTAMINATION", label: "Food Contamination" },
  { id: "FOREIGN_MATERIAL", label: "Foreign Material" },
  { id: "EMPLOYEE_GMP", label: "Employee GMP" },
  { id: "GROUNDS", label: "Grounds" },
  { id: "OTHER", label: "Other" },
];

type Mode =
  | "home"
  | "concern"
  | "cleaning"
  | "dust"
  | "spill"
  | "inspect"
  | "preop"
  | "verify"
  | "runner";

export default function SanitationFieldPage() {
  const router = useRouter();
  const { me } = useAuth();
  const opts = fieldAuthOpts(me);
  const permissions = me?.permissions ?? [];
  const canReport = hasFieldPermission(permissions, "field.sanitation.report", opts);
  const canClean = hasFieldPermission(permissions, "field.sanitation.clean", opts);
  const canInspect = hasFieldPermission(permissions, "field.sanitation.inspect", opts);
  const network = useNetworkStatus();

  const [mode, setMode] = useState<Mode>("home");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [concernType, setConcernType] = useState<ConcernType>("DUST");
  const [description, setDescription] = useState("");
  const [dustDepth, setDustDepth] = useState("0.125");
  const [dustUnit, setDustUnit] = useState<"INCHES" | "MM">("INCHES");
  const [dustSurface, setDustSurface] = useState("Floor");
  const [isPriorityArea, setIsPriorityArea] = useState(true);
  const [spillProduct, setSpillProduct] = useState("");
  const [spillLocation, setSpillLocation] = useState("");
  const [spillQty, setSpillQty] = useState("");

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateFilter, setTemplateFilter] = useState<"ALL" | "PREOP">("ALL");
  const [runnerDraft, setRunnerDraft] = useState<SanitationDraft | null>(null);
  const [verifyResult, setVerifyResult] = useState<"PASS" | "FAIL">("PASS");
  const [verifyNotes, setVerifyNotes] = useState("");

  const refreshPending = useCallback(() => {
    setPendingCount(sanitationPendingCount());
  }, []);

  const loadTasks = useCallback(async () => {
    if (!canClean && !canInspect) return;
    try {
      const res = await apiGet<{ items?: CleaningTask[] }>(
        `${API}/cleaning-tasks?status=SCHEDULED,ASSIGNED,IN_PROGRESS,AWAITING_VERIFICATION,OVERDUE,RECLEAN_REQUIRED`,
      );
      setTasks(res.items ?? []);
    } catch {
      /* ignore list errors on home */
    }
  }, [canClean, canInspect]);

  const loadSites = useCallback(async () => {
    if (!canInspect) return;
    try {
      const res = await apiGet<{ items?: SiteRow[] }>("/api/v1/industrial/sites");
      const items = res.items ?? [];
      setSites(items);
      setSiteId((prev) => (prev || (items.length === 1 ? items[0]!.id : prev)));
    } catch {
      /* optional */
    }
  }, [canInspect]);

  const loadTemplates = useCallback(
    async (preferCategory?: "PREOP" | "ALL") => {
      if (!canInspect) return;
      try {
        let res = await apiGet<{ items?: TemplateRow[] }>(`${API}/templates`);
        let items = res.items ?? [];
        if (items.length === 0) {
          try {
            const seeded = await apiSend<{ items?: TemplateRow[] }>(
              `${API}/templates/ensure-builtin`,
              "POST",
              {},
            );
            items = seeded.items ?? [];
          } catch {
            /* manage permission may be required */
            res = await apiGet<{ items?: TemplateRow[] }>(`${API}/templates`);
            items = res.items ?? [];
          }
        }
        setTemplates(items);
        if (preferCategory) setTemplateFilter(preferCategory);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load templates");
      }
    },
    [canInspect],
  );

  useEffect(() => {
    void loadTasks();
    refreshPending();
  }, [loadTasks, refreshPending]);

  useEffect(() => {
    const onOnline = () => {
      void (async () => {
        await flushSanitationQueue();
        refreshPending();
        await loadTasks();
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadTasks, refreshPending]);

  const awaitingVerification = useMemo(
    () =>
      tasks.filter((t) => String(t.status ?? "").toUpperCase() === "AWAITING_VERIFICATION"),
    [tasks],
  );

  const visibleTemplates = useMemo(() => {
    const list =
      templateFilter === "PREOP"
        ? templates.filter((t) => String(t.category ?? "").toUpperCase() === "PREOP")
        : templates;
    return [...list].sort((a, b) => {
      const aDaily = String(a.code ?? "") === "SAN-DAILY" ? 0 : 1;
      const bDaily = String(b.code ?? "") === "SAN-DAILY" ? 0 : 1;
      if (aDaily !== bDaily) return aDaily - bDaily;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }, [templates, templateFilter]);

  if (!canReport && !canClean && !canInspect) {
    return (
      <>
        <h1 className="ff-page-title">Sanitation</h1>
        <p className="ff-page-body">You do not have sanitation permissions for this company.</p>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/more/")}>
          Back
        </button>
      </>
    );
  }

  async function submitConcern() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiSend(`${API}/concerns`, "POST", {
        concernType,
        description: description.trim() || undefined,
      });
      setOkMsg("Sanitation concern submitted.");
      setDescription("");
      setMode("home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit concern");
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`${API}/cleaning-tasks/${encodeURIComponent(id)}/complete`, "POST", {
        notes: "Completed from Field",
      });
      setOkMsg("Cleaning task submitted.");
      await loadTasks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete task");
    } finally {
      setBusy(false);
    }
  }

  async function submitDust() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await apiSend<{ alert?: string; exceedsActionLevel?: boolean }>(
        `${API}/dust-measurements`,
        "POST",
        {
          surface: dustSurface,
          measurementPoint: dustSurface,
          dustDepth: Number(dustDepth),
          unit: dustUnit,
          isPriorityArea,
          comments: description.trim() || undefined,
        },
      );
      if (res?.alert === "CRITICAL_DUST_HOUSEKEEPING_ALERT" || res?.exceedsActionLevel) {
        setOkMsg("CRITICAL DUST HOUSEKEEPING ALERT — corrective action created.");
      } else {
        setOkMsg("Dust measurement recorded.");
      }
      setMode("home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record dust measurement");
    } finally {
      setBusy(false);
    }
  }

  async function submitSpill() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiSend(`${API}/spills`, "POST", {
        product: spillProduct.trim() || undefined,
        exactLocation: spillLocation.trim() || undefined,
        estimatedQuantity: spillQty.trim() || undefined,
        cause: description.trim() || undefined,
        slipFallHazard: true,
        dustHazard: true,
      });
      setOkMsg("Grain spill reported.");
      setMode("home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to report spill");
    } finally {
      setBusy(false);
    }
  }

  async function openInspect(filter: "ALL" | "PREOP") {
    setError(null);
    setOkMsg(null);
    setBusy(true);
    try {
      await loadSites();
      await loadTemplates(filter);
      setMode(filter === "PREOP" ? "preop" : "inspect");
    } finally {
      setBusy(false);
    }
  }

  async function startFromTemplate(template: TemplateRow) {
    if (!siteId) {
      setError("Select a site before starting an inspection.");
      return;
    }
    const questions = questionsFromTemplateJson(template.templateJson);
    if (!questions.length) {
      setError("Template has no checklist questions.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    const offlineClientId = crypto.randomUUID();
    const title = `${template.name ?? "Sanitation inspection"} — ${new Date().toLocaleString()}`;
    const body = {
      siteId,
      templateId: template.id,
      title,
      offlineClientId,
      inspectionType: template.category ?? undefined,
    };

    try {
      let inspectionId = offlineClientId;
      if (network === "offline") {
        enqueueSanitationMutation("POST", `${API}/inspections`, body, offlineClientId);
        refreshPending();
      } else {
        const result = await sanitationSend<{ id?: string }>(`${API}/inspections`, "POST", body, {
          offlineClientId,
        });
        refreshPending();
        if (result.queued) {
          inspectionId = offlineClientId;
        } else if (result.data?.id) {
          inspectionId = result.data.id;
        }
      }

      const draft: SanitationDraft = {
        inspectionId,
        offlineClientId,
        templateId: template.id,
        templateName: String(template.name ?? "Inspection"),
        siteId,
        title,
        questions,
        responses: {},
        index: 0,
        savedAt: new Date().toISOString(),
      };
      saveSanitationDraft(draft);
      setRunnerDraft(draft);
      setMode("runner");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start inspection");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(taskId: string) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const result = await sanitationSend(
        `${API}/verifications`,
        "POST",
        {
          cleaningTaskId: taskId,
          method: "VISUAL",
          result: verifyResult,
          notes: verifyNotes.trim() || undefined,
          ...(siteId ? { siteId } : {}),
        },
      );
      refreshPending();
      setOkMsg(
        result.queued
          ? "Verification queued for sync."
          : verifyResult === "PASS"
            ? "Cleaning verified (PASS)."
            : "Verification recorded (FAIL).",
      );
      setVerifyNotes("");
      await loadTasks();
      setMode("home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit verification");
    } finally {
      setBusy(false);
    }
  }

  function siteLabel(s: SiteRow): string {
    return (s.name || s.label || s.id).trim();
  }

  return (
    <>
      <OfflineBanner pendingCount={pendingCount} />
      {mode !== "runner" ? (
        <>
          <h1 className="ff-page-title">Sanitation</h1>
          <p className="ff-page-body">Housekeeping, dust, spills, inspections, and cleaning.</p>
          <Suspense fallback={null}>
            <FoodSafetyBanner />
          </Suspense>
        </>
      ) : null}
      {error ? <p className="ff-error">{error}</p> : null}
      {okMsg && mode !== "runner" ? <p className="ff-hint ff-hint--left">{okMsg}</p> : null}
      {pendingCount > 0 && mode === "home" ? (
        <p className="ff-hint ff-hint--left">
          {pendingCount} pending sync item{pendingCount === 1 ? "" : "s"}
        </p>
      ) : null}

      {mode === "home" ? (
        <div className="ff-action-grid">
          {canInspect ? (
            <>
              <button
                type="button"
                className="ff-action-tile"
                disabled={busy}
                onClick={() => void openInspect("ALL")}
              >
                Start Inspection
                <span>Checklist from sanitation templates</span>
              </button>
              <button
                type="button"
                className="ff-action-tile"
                disabled={busy}
                onClick={() => void openInspect("PREOP")}
              >
                Pre-Op
                <span>Pre-operational inspection templates</span>
              </button>
            </>
          ) : null}
          {canReport ? (
            <>
              <button type="button" className="ff-action-tile" onClick={() => setMode("concern")}>
                Report Concern
                <span>Dust, pest, trash, GMP, and more</span>
              </button>
              <button type="button" className="ff-action-tile" onClick={() => setMode("spill")}>
                Report Grain Spill
                <span>Product spill cleanup workflow</span>
              </button>
            </>
          ) : null}
          {canInspect ? (
            <button type="button" className="ff-action-tile" onClick={() => setMode("dust")}>
              Dust Measurement
              <span>Priority area 1/8&quot; action level</span>
            </button>
          ) : null}
          {canClean ? (
            <button type="button" className="ff-action-tile" onClick={() => setMode("cleaning")}>
              Cleaning Tasks
              <span>{tasks.length ? `${tasks.length} open` : "Assigned MSS work"}</span>
            </button>
          ) : null}
          {canInspect ? (
            <button
              type="button"
              className="ff-action-tile"
              onClick={() => {
                setError(null);
                setOkMsg(null);
                void loadTasks();
                setMode("verify");
              }}
            >
              Verify Cleaning
              <span>
                {awaitingVerification.length
                  ? `${awaitingVerification.length} awaiting`
                  : "Visual PASS / FAIL"}
              </span>
            </button>
          ) : null}
          <button type="button" className="ff-btn ff-btn-secondary ff-action-grid-span" onClick={() => router.push("/more/")}>
            Back to More
          </button>
        </div>
      ) : null}

      {mode === "inspect" || mode === "preop" ? (
        <div className="ff-stack">
          <h2 className="ff-page-title ff-page-title--section">
            {mode === "preop" ? "Pre-Op templates" : "Start inspection"}
          </h2>
          <label className="ff-field">
            <span className="ff-label">Site</span>
            <select className="ff-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {siteLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {visibleTemplates.length === 0 ? (
            <p className="ff-hint ff-hint--left">
              {mode === "preop"
                ? "No PREOP templates available."
                : "No sanitation templates available."}
            </p>
          ) : null}
          <div className="ff-task-list">
            {visibleTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="ff-task-card"
                disabled={busy}
                onClick={() => void startFromTemplate(t)}
              >
                <div className="ff-task-card-body">
                  <p className="ff-task-kind">{t.category || "Sanitation"}</p>
                  <p className="ff-task-title">{t.name || t.code || "Template"}</p>
                  <p className="ff-meta">
                    {[t.code, `${questionsFromTemplateJson(t.templateJson).length} items`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => {
              setMode("home");
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {mode === "runner" && runnerDraft ? (
        <SanitationChecklistRunner
          draft={runnerDraft}
          onPendingChange={setPendingCount}
          onExit={() => {
            setRunnerDraft(null);
            setMode("home");
          }}
          onCompleted={(msg) => {
            setOkMsg(msg);
            setRunnerDraft(null);
            setMode("home");
            refreshPending();
          }}
        />
      ) : null}

      {mode === "verify" ? (
        <div className="ff-stack">
          <h2 className="ff-page-title ff-page-title--section">Verify cleaning</h2>
          <label className="ff-field">
            <span className="ff-label">Result</span>
            <select
              className="ff-select"
              value={verifyResult}
              onChange={(e) => setVerifyResult(e.target.value as "PASS" | "FAIL")}
            >
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </label>
          <label className="ff-field">
            <span className="ff-label">Notes</span>
            <textarea
              className="ff-input"
              rows={3}
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
            />
          </label>
          {awaitingVerification.length === 0 ? (
            <p className="ff-hint ff-hint--left">No tasks awaiting verification.</p>
          ) : null}
          {awaitingVerification.map((task) => (
            <div key={task.id} className="ff-card">
              <strong>{task.title || "Cleaning task"}</strong>
              <p className="ff-hint ff-hint--left">
                {[task.taskNumber, task.status, task.dueAt ? new Date(task.dueAt).toLocaleString() : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={busy}
                onClick={() => void submitVerification(task.id)}
              >
                Submit {verifyResult} (visual)
              </button>
            </div>
          ))}
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setMode("home")}>
            Back
          </button>
        </div>
      ) : null}

      {mode === "concern" ? (
        <div className="ff-stack">
          <h2 className="ff-page-title ff-page-title--section">Report concern</h2>
          <label className="ff-field">
            <span className="ff-label">Concern type</span>
            <select
              className="ff-select"
              value={concernType}
              onChange={(e) => setConcernType(e.target.value as ConcernType)}
            >
              {CONCERN_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ff-field">
            <span className="ff-label">Description</span>
            <textarea
              className="ff-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={busy}
            onClick={() => void submitConcern()}
          >
            Submit
          </button>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setMode("home")}>
            Cancel
          </button>
        </div>
      ) : null}

      {mode === "dust" ? (
        <div className="ff-stack">
          <h2 className="ff-page-title ff-page-title--section">Dust measurement</h2>
          <label className="ff-field">
            <span className="ff-label">Surface</span>
            <input className="ff-input" value={dustSurface} onChange={(e) => setDustSurface(e.target.value)} />
          </label>
          <label className="ff-field">
            <span className="ff-label">Dust depth</span>
            <input
              className="ff-input"
              inputMode="decimal"
              value={dustDepth}
              onChange={(e) => setDustDepth(e.target.value)}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">Unit</span>
            <select
              className="ff-select"
              value={dustUnit}
              onChange={(e) => setDustUnit(e.target.value as "INCHES" | "MM")}
            >
              <option value="INCHES">Inches</option>
              <option value="MM">Millimeters</option>
            </select>
          </label>
          <label className="ff-check">
            <input
              type="checkbox"
              checked={isPriorityArea}
              onChange={(e) => setIsPriorityArea(e.target.checked)}
            />
            <span>Priority housekeeping area (grain elevator)</span>
          </label>
          <label className="ff-field">
            <span className="ff-label">Comments</span>
            <textarea
              className="ff-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={busy}
            onClick={() => void submitDust()}
          >
            Record measurement
          </button>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setMode("home")}>
            Cancel
          </button>
        </div>
      ) : null}

      {mode === "spill" ? (
        <div className="ff-stack">
          <h2 className="ff-page-title ff-page-title--section">Report spill</h2>
          <label className="ff-field">
            <span className="ff-label">Product</span>
            <input className="ff-input" value={spillProduct} onChange={(e) => setSpillProduct(e.target.value)} />
          </label>
          <label className="ff-field">
            <span className="ff-label">Exact location</span>
            <input
              className="ff-input"
              value={spillLocation}
              onChange={(e) => setSpillLocation(e.target.value)}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">Estimated quantity</span>
            <input className="ff-input" value={spillQty} onChange={(e) => setSpillQty(e.target.value)} />
          </label>
          <label className="ff-field">
            <span className="ff-label">Cause / notes</span>
            <textarea
              className="ff-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={busy}
            onClick={() => void submitSpill()}
          >
            Report spill
          </button>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setMode("home")}>
            Cancel
          </button>
        </div>
      ) : null}

      {mode === "cleaning" ? (
        <div className="ff-stack">
          {tasks.length === 0 ? (
            <p className="ff-hint ff-hint--left">No open cleaning tasks assigned.</p>
          ) : null}
          {tasks.map((task) => (
            <div key={task.id} className="ff-card">
              <strong>{task.title || "Cleaning task"}</strong>
              <p className="ff-hint ff-hint--left">
                {[task.taskNumber, task.status, task.dueAt ? new Date(task.dueAt).toLocaleString() : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={busy}
                onClick={() => void completeTask(task.id)}
              >
                Complete
              </button>
            </div>
          ))}
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setMode("home")}>
            Back
          </button>
        </div>
      ) : null}
    </>
  );
}
