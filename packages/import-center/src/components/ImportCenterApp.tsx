"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ImportApi } from "../api.js";
import { clearImportTenantCache, setCachedJobs, getCachedJobs } from "../cache.js";
import { initiateProtectedDownload } from "../download.js";
import {
  dashboardStatusBuckets,
  DASHBOARD_BUCKET_LABELS,
  serializeJobFilters,
  type ImportJobFilterState,
} from "../filters.js";
import { actionAllowed, disabledReason } from "../permissions.js";
import { formatImportError, sanitizeErrorMessage } from "../safe-error.js";
import {
  isExecutionActiveStatus,
  resolveImportWorkflowView,
  WORKFLOW_STEP_ORDER,
} from "../state-router.js";
import type {
  ImportJobSummary,
  ImportMappingRow,
  ImportRowError,
  ImportWorkflowView,
  MalwareVerdict,
} from "../types.js";
import {
  DuplicateConfidenceBadge,
  ImportEmptyState,
  ImportProgressBar,
  ImportStatusBadge,
  MalwareVerdictBadge,
  PrivilegedAccessBanner,
  ProductionScannerRestrictionBanner,
  isProductionImportUploadBlocked,
  SensitiveValue,
} from "./badges.js";

export type CreateLookupFn = (input: {
  kind: string;
  name: string;
}) => Promise<{ id: string; name: string }>;

export type ImportCenterAppProps = {
  api: ImportApi;
  tenantId: string | null;
  hasPermission: (code: string) => boolean;
  /** Base path without trailing slash, e.g. `/imports` */
  basePath?: string;
  /** Optional Link component from next/link */
  LinkComponent?: (props: { href: string; children: ReactNode; className?: string }) => ReactNode;
  initialJobId?: string | null;
  initialView?: ImportWorkflowView | null;
  onNavigate?: (href: string) => void;
  /** Application environment — drives production scanner restriction banner */
  appEnv?: string | null;
  /**
   * Configured malware provider key (mirrors API IMPORT_MALWARE_PROVIDER_KEY).
   * Production uploads stay blocked while this is `reference-malware`.
   */
  malwareProviderKey?: string | null;
  /** Compact chrome for embedding inside onboarding / setup flows */
  embedded?: boolean;
  /** Hide package title/description when the host already provides page chrome */
  hideChrome?: boolean;
  /** Prefill New Import product key (e.g. FORGE_INDUSTRIAL in Industrial web). */
  defaultProductKey?: string;
  /** Prefill New Import module key when creating jobs. */
  defaultModuleKey?: string;
  /** Create missing department/position/employment type from validation errors */
  createLookup?: CreateLookupFn;
};

/** Parse row-error text that mentions an unknown department or position. */
export function parseMissingOrgLookupHint(
  message: string,
  fieldPath?: string | null,
): { kind: "department" | "position" | "employment_type"; name: string } | null {
  const haystack = `${fieldPath ?? ""} ${message}`;
  const match = haystack.match(
    /(?:unknown|missing|invalid)\s+(department|position|employment[_\s-]?type)\s*(?:named\s+)?[:\-]?\s*["']?([^"'.,;\n]+)/i,
  );
  if (match?.[1] && match[2]) {
    const raw = match[1].toLowerCase().replace(/[\s-]+/g, "_");
    const kind = raw.startsWith("employment")
      ? ("employment_type" as const)
      : (raw as "department" | "position");
    return { kind, name: match[2].trim() };
  }
  const quoted = message.match(/["']([^"']+)["']/);
  if (quoted?.[1] && fieldPath) {
    if (/department/i.test(fieldPath)) return { kind: "department", name: quoted[1].trim() };
    if (/position|job.?title/i.test(fieldPath)) return { kind: "position", name: quoted[1].trim() };
    if (/employment/i.test(fieldPath)) return { kind: "employment_type", name: quoted[1].trim() };
  }
  return null;
}

function normalizeJobsPayload(data: unknown): ImportJobSummary[] {
  if (Array.isArray(data)) return data as ImportJobSummary[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: ImportJobSummary[] }).items;
  }
  return [];
}

function hashFragment(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…`;
}

const INDUSTRIAL_RECORD_PRESETS = [
  { recordCategory: "site", moduleKey: "ORG", label: "Sites / locations" },
  { recordCategory: "department", moduleKey: "ORG", label: "Departments" },
  { recordCategory: "position", moduleKey: "ORG", label: "Positions / job titles" },
  { recordCategory: "employment_type", moduleKey: "ORG", label: "Employment types" },
  { recordCategory: "personnel", moduleKey: "PERSONNEL", label: "Personnel" },
  { recordCategory: "fleet_vehicle", moduleKey: "FLEET", label: "Fleet vehicles" },
  { recordCategory: "training_record", moduleKey: "TRAINING", label: "Training history" },
] as const;

export function ImportCenterApp(props: ImportCenterAppProps) {
  const {
    api,
    tenantId,
    hasPermission,
    basePath = "/imports",
    initialJobId = null,
    initialView = null,
    onNavigate,
    appEnv = null,
    malwareProviderKey = null,
    embedded = false,
    hideChrome = false,
    defaultProductKey = "",
    defaultModuleKey = "",
    createLookup,
  } = props;

  const [view, setView] = useState<ImportWorkflowView>(initialView ?? "dashboard");
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [jobs, setJobs] = useState<ImportJobSummary[]>([]);
  const [job, setJob] = useState<ImportJobSummary | null>(null);
  const [filters, setFilters] = useState<ImportJobFilterState>({
    page: 1,
    pageSize: 25,
    ...(defaultProductKey ? { productKey: defaultProductKey } : {}),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ImportMappingRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [statusPayload, setStatusPayload] = useState<Record<string, unknown> | null>(null);
  const [resultsPayload, setResultsPayload] = useState<Record<string, unknown> | null>(null);
  const [duplicates, setDuplicates] = useState<unknown[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [lookupBusy, setLookupBusy] = useState<string | null>(null);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({
    displayName: "",
    description: "",
    productKey: defaultProductKey,
    moduleKey: defaultModuleKey,
    recordCategory: "",
    format: "csv" as "csv" | "xlsx" | "json",
  });
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canView = actionAllowed(hasPermission, "import.view");
  const privileged = actionAllowed(hasPermission, "import.sensitive");
  const [privilegedSession, setPrivilegedSession] = useState(false);
  const productionUploadsBlocked = isProductionImportUploadBlocked({
    appEnv,
    malwareProviderKey,
  });

  const navigate = useCallback(
    (nextView: ImportWorkflowView, nextJobId?: string | null) => {
      setView(nextView);
      if (nextJobId !== undefined) setJobId(nextJobId);
      const q = new URLSearchParams();
      if (nextJobId) q.set("jobId", nextJobId);
      if (nextView !== "dashboard") q.set("view", nextView);
      const href = `${basePath}/${q.toString() ? `?${q.toString()}` : ""}`;
      onNavigate?.(href);
    },
    [basePath, onNavigate],
  );

  useEffect(() => {
    const abortController = abortRef.current;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      abortController?.abort();
    };
  }, []);

  useEffect(() => {
    clearImportTenantCache();
    setJobs([]);
    setJob(null);
    setMappings([]);
    setErrors([]);
    setStatusPayload(null);
    setResultsPayload(null);
    setDuplicates([]);
  }, [tenantId]);

  const reportError = useCallback((err: unknown) => {
    const formatted = formatImportError(err);
    setError(sanitizeErrorMessage(formatted.message));
    setCorrelationId(formatted.correlationId ?? null);
  }, []);

  const loadJobs = useCallback(async () => {
    if (!tenantId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listJobs(serializeJobFilters(filters));
      const items = normalizeJobsPayload(data);
      setJobs(items);
      setCachedJobs(tenantId, items);
    } catch (err) {
      reportError(err);
      const cached = getCachedJobs(tenantId);
      if (Array.isArray(cached)) setJobs(cached as ImportJobSummary[]);
    } finally {
      setLoading(false);
    }
  }, [api, canView, filters, reportError, tenantId]);

  const loadJob = useCallback(
    async (id: string) => {
      if (!tenantId || !canView) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await api.getJob(id);
        setJob(detail);
        const recommended = resolveImportWorkflowView(detail.status);
        if (!initialView) {
          setView(recommended);
        }
      } catch (err) {
        reportError(err);
        setJob(null);
      } finally {
        setLoading(false);
      }
    },
    [api, canView, initialView, reportError, tenantId],
  );

  useEffect(() => {
    if (view === "dashboard") void loadJobs();
  }, [view, loadJobs]);

  useEffect(() => {
    if (jobId && view !== "dashboard" && view !== "new") void loadJob(jobId);
  }, [jobId, view, loadJob]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!jobId || view !== "execution") return;
    const tick = async () => {
      try {
        const status = await api.getStatus(jobId);
        setStatusPayload(status);
        const st = String(status.status ?? "");
        if (!isExecutionActiveStatus(st)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setView("results");
          void loadJob(jobId);
        }
      } catch {
        // transient — keep polling
      }
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [api, jobId, loadJob, view]);

  const buckets = useMemo(() => dashboardStatusBuckets(jobs.map((j) => String(j.status))), [jobs]);

  if (!tenantId) {
    return <ImportEmptyState title="Select a tenant to open Import Center." />;
  }
  if (!canView) {
    return (
      <ImportEmptyState title="Import Center is unavailable.">
        <p>Requires permission import.view. Server authorization remains authoritative.</p>
      </ImportEmptyState>
    );
  }

  async function handleCreateAndUpload(file: File | null) {
    const blocked = disabledReason(hasPermission, "import.upload");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (productionUploadsBlocked) {
      setError(
        "File uploads are blocked in this environment until a production malware scanner is configured.",
      );
      return;
    }
    if (!newForm.recordCategory) {
      setError("Select a record type before uploading a file.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setLoading(true);
    setError(null);
    setUploadProgress(0);
    try {
      const init = (await api.initializeUpload({
        productKey: newForm.productKey || defaultProductKey || "REFERENCE",
        moduleKey: newForm.moduleKey || defaultModuleKey || "CORE",
        recordCategory: newForm.recordCategory || "generic_record",
        displayName: newForm.displayName || file.name,
        description: newForm.description || undefined,
        fileName: file.name,
        contentType: file.type || "text/csv",
        byteSize: file.size,
        format: newForm.format,
      })) as {
        job?: { id: string };
        jobId?: string;
        upload?: {
          mode?: string;
          uploadUrl?: string;
          multipartUploadId?: string;
          partSizeBytes?: number;
          partCount?: number;
          parts?: Array<{ uploadUrl: string; partNumber: number }>;
        };
      };
      const createdJobId = init.job?.id ?? init.jobId;
      if (!createdJobId) {
        throw new Error("Upload initialization did not return jobId.");
      }
      if (init.upload?.mode === "S3_PRESIGNED" && init.upload.uploadUrl) {
        await putWithProgress(init.upload.uploadUrl, file, setUploadProgress);
        await api.completeUpload(createdJobId, {});
      } else if (init.upload?.mode === "S3_MULTIPART" && init.upload.parts?.length) {
        const parts: Array<{ partNumber: number; etag: string }> = [];
        const partSize = init.upload.partSizeBytes ?? 5 * 1024 * 1024;
        for (const part of init.upload.parts) {
          const start = (part.partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const blob = file.slice(start, end);
          const etag = await putPart(part.uploadUrl, blob);
          parts.push({ partNumber: part.partNumber, etag });
          setUploadProgress(Math.round((end / file.size) * 100));
        }
        // Request remaining part URLs when initial batch is incomplete.
        let nextPart = (init.upload.parts.at(-1)?.partNumber ?? 0) + 1;
        const totalParts = init.upload.partCount ?? parts.length;
        while (nextPart <= totalParts) {
          const batch = (await api.getUploadParts(createdJobId, {
            partNumbers: Array.from(
              { length: Math.min(20, totalParts - nextPart + 1) },
              (_, i) => nextPart + i,
            ),
          })) as { parts?: Array<{ uploadUrl: string; partNumber: number }> };
          const more = batch?.parts ?? [];
          if (!more.length) break;
          for (const part of more) {
            const start = (part.partNumber - 1) * partSize;
            const end = Math.min(start + partSize, file.size);
            const etag = await putPart(part.uploadUrl, file.slice(start, end));
            parts.push({ partNumber: part.partNumber, etag });
            setUploadProgress(Math.round((end / file.size) * 100));
          }
          nextPart = (more.at(-1)?.partNumber ?? nextPart) + 1;
        }
        await api.completeUpload(createdJobId, { parts });
      } else {
        throw new Error("Upload initialization did not return a supported upload mode.");
      }
      setJobId(createdJobId);
      navigate("security", createdJobId);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  }

  async function handleRescan(reason: string) {
    const blocked = disabledReason(hasPermission, "import.validate");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!job?.id || !job.file?.id) return;
    if (!window.confirm("Request a malware rescan for this file?")) return;
    setLoading(true);
    try {
      await api.rescan(job.id, job.file.id, { reason });
      await loadJob(job.id);
      setView("security");
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMappings() {
    const blocked = disabledReason(hasPermission, "import.map");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!jobId) return;
    setLoading(true);
    try {
      await api.putMappings(
        jobId,
        mappings.length
          ? mappings
          : [{ sourceColumn: "col1", targetField: "field1", isRequired: true, ordinal: 0 }],
      );
      await loadJob(jobId);
      setView("validation");
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    const blocked = disabledReason(hasPermission, "import.approve");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!jobId) return;
    if (!window.confirm("Approve this import for execution?")) return;
    setLoading(true);
    try {
      await api.approve(jobId);
      await loadJob(jobId);
      setView("execute");
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    const blocked = disabledReason(hasPermission, "import.execute");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!jobId) return;
    if (
      !window.confirm("Queue this import for execution? Row data is not sent from the browser.")
    ) {
      return;
    }
    setLoading(true);
    try {
      await api.execute(jobId, {});
      setView("execution");
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(kind: "results" | "errors" | "security", privilegedReq = false) {
    if (!jobId) return;
    if (privilegedReq) {
      const blocked = disabledReason(hasPermission, "import.sensitive");
      if (blocked) {
        setError(blocked);
        return;
      }
      if (!window.confirm("Request a privileged download? Access is audited.")) return;
      setPrivilegedSession(true);
    }
    setLoading(true);
    try {
      const auth =
        kind === "results"
          ? await api.downloadResults(jobId, privilegedReq)
          : kind === "errors"
            ? await api.downloadErrors(jobId, privilegedReq)
            : await api.downloadSecurityReport(jobId);
      await initiateProtectedDownload({
        downloadUrl: auth.downloadUrl,
        expiresAt: auth.expiresAt,
        contentType: auth.contentType,
        fileName: `${kind}-${jobId}.json`,
      });
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRollback() {
    const blocked = disabledReason(hasPermission, "import.rollback");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!jobId) return;
    if (
      !window.confirm(
        "Request rollback classification? Full compensation is not yet implemented; this submits a classification request only.",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await api.requestRollback(jobId, {});
      await loadJob(jobId);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryError(errorId: string) {
    const blocked = disabledReason(hasPermission, "import.error.reprocess");
    if (blocked) {
      setError(blocked);
      return;
    }
    if (!jobId) return;
    if (!window.confirm("Retry this eligible row error?")) return;
    setLoading(true);
    try {
      await api.retryError(jobId, errorId, {});
      const rows = await api.listErrors(jobId);
      setErrors(Array.isArray(rows) ? rows : []);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoMap() {
    if (!jobId) return;
    const blocked = disabledReason(hasPermission, "import.map");
    if (blocked) {
      setError(blocked);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const suggested = await api.suggestMappings(jobId);
      setMappings(Array.isArray(suggested.mappings) ? suggested.mappings : []);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateLookup(kind: string, name: string) {
    if (!createLookup) return;
    const key = `${kind}:${name}`;
    setLookupBusy(key);
    setLookupNotice(null);
    setError(null);
    try {
      const created = await createLookup({ kind, name });
      setLookupNotice(
        `Created ${kind.replace(/_/g, " ")} “${created.name}”. Re-validate to continue.`,
      );
    } catch (err) {
      reportError(err);
    } finally {
      setLookupBusy(null);
    }
  }

  function renderLookupAction(err: ImportRowError) {
    if (!createLookup) return null;
    const hint = parseMissingOrgLookupHint(err.message, err.fieldPath);
    if (!hint) return null;
    const key = `${hint.kind}:${hint.name}`;
    return (
      <button
        type="button"
        disabled={lookupBusy === key}
        onClick={() => void handleCreateLookup(hint.kind, hint.name)}
        className="forge-ic-inline-action"
      >
        {lookupBusy === key ? "Creating…" : `Create ${hint.kind.replace(/_/g, " ")} “${hint.name}”`}
      </button>
    );
  }

  const malwareVerdict = (job?.file?.malwareVerdict ?? "NOT_SUBMITTED") as MalwareVerdict;
  const quarantined =
    job?.status === "QUARANTINED" || job?.file?.quarantineStatus === "QUARANTINED";

  const rootClass = [
    "forge-import-center",
    embedded ? "forge-import-center--embedded" : "",
    hideChrome ? "forge-import-center--hosted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      {!hideChrome ? (
        <header className="forge-ic-header">
          <h1 className="forge-ic-title">{embedded ? "Data Import" : "Import Center"}</h1>
          {embedded ? (
            <p className="forge-ic-subtitle">
              Import Personnel (XLSX/CSV) and Fleet without leaving onboarding.
            </p>
          ) : (
            <p className="forge-ic-subtitle">
              Shared Universal Import Platform — product-neutral workflow. Server state is
              authoritative.
            </p>
          )}
        </header>
      ) : null}

      <ProductionScannerRestrictionBanner appEnv={appEnv} malwareProviderKey={malwareProviderKey} />
      {!embedded ? <PrivilegedAccessBanner visible={privilegedSession} /> : null}
      {lookupNotice ? (
        <div role="status" className="forge-ic-panel forge-ic-panel--success">
          {lookupNotice}
        </div>
      ) : null}

      <nav aria-label="Import Center sections" className="forge-ic-nav">
        {(
          [
            ["dashboard", "Overview"],
            ["new", "New Import"],
            ["profiles", "Profiles"],
            ["templates", "Templates"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => navigate(v, v === "dashboard" || v === "new" ? null : jobId)}
            aria-current={view === v ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {jobId && view !== "dashboard" && view !== "new" ? (
        <ol aria-label="Import workflow steps" className="forge-ic-steps">
          {WORKFLOW_STEP_ORDER.filter((s) => s.view !== "new").map((step) => (
            <li key={step.view}>
              <button
                type="button"
                disabled={quarantined && !["security", "quarantine", "results"].includes(step.view)}
                onClick={() => navigate(step.view, jobId)}
                aria-current={view === step.view ? "step" : undefined}
              >
                {step.label}
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <div role="alert" className="forge-ic-panel forge-ic-panel--danger">
          <strong>Error</strong>
          <p>{error}</p>
          {correlationId ? <p>Correlation ID: {correlationId}</p> : null}
        </div>
      ) : null}

      {loading ? <p role="status">Loading…</p> : null}

      {view === "dashboard" ? (
        <section aria-labelledby="import-dashboard-heading" className="forge-ic-dashboard">
          <h2 id="import-dashboard-heading">Overview</h2>
          <div className="forge-ic-stat-grid">
            {Object.entries(buckets).map(([key, value]) => (
              <div key={key} className="forge-ic-stat-card">
                <div className="forge-ic-stat-label">{DASHBOARD_BUCKET_LABELS[key] ?? key}</div>
                <div className="forge-ic-stat-value">{value}</div>
              </div>
            ))}
          </div>
          <div className="forge-ic-panel forge-ic-filters">
            <div className="forge-ic-filters-grid">
              <label htmlFor="import-search" className="forge-ic-field">
                Search
                <input
                  id="import-search"
                  value={filters.search ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                  className="forge-ic-control"
                  placeholder="Name, file, or record type"
                />
              </label>
              <label htmlFor="import-status" className="forge-ic-field">
                Status
                <select
                  id="import-status"
                  value={filters.status ?? ""}
                  onChange={(e) =>
                    setFilters((f) => {
                      const next = { ...f, page: 1 };
                      if (e.target.value) next.status = e.target.value;
                      else delete next.status;
                      return next;
                    })
                  }
                  className="forge-ic-control"
                >
                  <option value="">Any</option>
                  {[
                    "READY_FOR_MAPPING",
                    "AWAITING_APPROVAL",
                    "PROCESSING",
                    "COMPLETED",
                    "FAILED",
                    "QUARANTINED",
                    "SCAN_FAILED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="forge-ic-filters-actions">
                <button
                  type="button"
                  className="forge-ic-btn forge-ic-btn--secondary"
                  onClick={() => void loadJobs()}
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
          {jobs.length === 0 && !loading ? (
            <ImportEmptyState title="No import jobs for this tenant.">
              <button
                type="button"
                className="forge-ic-btn forge-ic-btn--primary"
                onClick={() => navigate("new", null)}
              >
                Start a new import
              </button>
            </ImportEmptyState>
          ) : (
            <div className="forge-ic-table-wrap">
              <table className="forge-ic-table">
                <thead>
                  <tr>
                    {[
                      "Name",
                      "File",
                      "Record",
                      "Status",
                      "Malware",
                      "Progress",
                      "Updated",
                      "Actions",
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.displayName}</td>
                      <td>{row.file?.fileName ?? "—"}</td>
                      <td>{row.recordCategory}</td>
                      <td>
                        <ImportStatusBadge status={String(row.status)} />
                      </td>
                      <td>
                        <MalwareVerdictBadge
                          verdict={(row.file?.malwareVerdict as string) ?? "NOT_SUBMITTED"}
                        />
                      </td>
                      <td>{row.progressPercent ?? 0}%</td>
                      <td>{new Date(row.updatedAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="forge-ic-btn forge-ic-btn--secondary"
                          onClick={() => navigate(resolveImportWorkflowView(row.status), row.id)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "new" ? (
        <section
          aria-labelledby="new-import-heading"
          className="forge-ic-panel forge-ic-new-import"
        >
          <h2 id="new-import-heading">New import</h2>
          <p className="forge-ic-help forge-ic-help--lead">
            Choose a name, Industrial record type, and file. Mapping and validation happen after
            upload.
          </p>
          {productionUploadsBlocked ? (
            <div className="forge-ic-banner forge-ic-banner--warning" role="status">
              <span className="forge-ic-banner-icon" aria-hidden="true">
                !
              </span>
              <div className="forge-ic-banner-body">
                <strong className="forge-ic-banner-title">Uploads unavailable in production</strong>
                <p className="forge-ic-banner-text">
                  File uploads stay blocked until a production malware scanner is configured. You
                  can still browse templates and review existing jobs.
                </p>
              </div>
            </div>
          ) : null}
          <div className="forge-ic-form-grid">
            <label htmlFor="new-displayName" className="forge-ic-field forge-ic-field--span-2">
              Import name
              <input
                id="new-displayName"
                value={newForm.displayName}
                onChange={(e) => setNewForm((f) => ({ ...f, displayName: e.target.value }))}
                className="forge-ic-control"
                placeholder="e.g. March personnel roster"
              />
            </label>
            <label htmlFor="new-description" className="forge-ic-field forge-ic-field--span-2">
              Description
              <input
                id="new-description"
                value={newForm.description}
                onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                className="forge-ic-control"
                placeholder="Optional notes for this import"
              />
            </label>
            <label htmlFor="new-recordCategory" className="forge-ic-field">
              Record type
              <select
                id="new-recordCategory"
                value={newForm.recordCategory}
                onChange={(e) => {
                  const recordCategory = e.target.value;
                  const preset = INDUSTRIAL_RECORD_PRESETS.find(
                    (p) => p.recordCategory === recordCategory,
                  );
                  setNewForm((f) => ({
                    ...f,
                    recordCategory,
                    moduleKey: preset?.moduleKey ?? f.moduleKey,
                    productKey: f.productKey || defaultProductKey || "FORGE_INDUSTRIAL",
                  }));
                }}
                className="forge-ic-control"
              >
                <option value="">Select a record type</option>
                {INDUSTRIAL_RECORD_PRESETS.map((preset) => (
                  <option key={preset.recordCategory} value={preset.recordCategory}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="new-format" className="forge-ic-field">
              Expected format
              <select
                id="new-format"
                value={newForm.format}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, format: e.target.value as "csv" | "xlsx" | "json" }))
                }
                className="forge-ic-control"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <label htmlFor="new-file" className="forge-ic-field forge-ic-field--span-2">
              File
              <input
                id="new-file"
                type="file"
                accept=".csv,.xlsx,.json,.zip,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
                onChange={(e) => void handleCreateAndUpload(e.target.files?.[0] ?? null)}
                disabled={
                  productionUploadsBlocked ||
                  Boolean(disabledReason(hasPermission, "import.upload")) ||
                  !newForm.recordCategory
                }
                className="forge-ic-control"
              />
            </label>
          </div>
          <p className="forge-ic-help">
            Large files are processed on the server. Presigned upload URLs are never logged.
          </p>
          {uploadProgress != null ? (
            <ImportProgressBar percent={uploadProgress} label="Upload progress" />
          ) : null}
          {disabledReason(hasPermission, "import.upload") ? (
            <p role="status">{disabledReason(hasPermission, "import.upload")}</p>
          ) : null}
        </section>
      ) : null}

      {view === "security" && job ? (
        <section className="forge-ic-panel" aria-labelledby="security-heading">
          <h2 id="security-heading">Security scan</h2>
          <p>
            Verdict: <MalwareVerdictBadge verdict={malwareVerdict} />
          </p>
          <p>
            Job status: <ImportStatusBadge status={String(job.status)} />
          </p>
          <p>Hash: {hashFragment(job.file?.contentHash)}</p>
          <p>Scan attempts are managed by the server. No malware override control is available.</p>
          {job.status === "SCAN_FAILED" ||
          malwareVerdict === "SCAN_TIMEOUT" ||
          malwareVerdict === "SCAN_FAILED" ? (
            <div>
              <label htmlFor="rescan-reason">
                Rescan justification
                <textarea id="rescan-reason" rows={3} className="forge-ic-control" />
              </label>
              <button
                type="button"
                className="forge-ic-btn-spacer"
                disabled={Boolean(disabledReason(hasPermission, "import.validate"))}
                onClick={() => {
                  const el = document.getElementById("rescan-reason") as HTMLTextAreaElement | null;
                  void handleRescan(el?.value ?? "");
                }}
              >
                Request rescan
              </button>
            </div>
          ) : null}
          {malwareVerdict === "CLEAN" ? (
            <button type="button" onClick={() => navigate("mapping", job.id)}>
              Continue to mapping
            </button>
          ) : null}
        </section>
      ) : null}

      {view === "quarantine" && job ? (
        <section className="forge-ic-panel" aria-labelledby="quarantine-heading">
          <h2 id="quarantine-heading">Quarantine</h2>
          <ul>
            <li>Job ID: {job.id}</li>
            <li>File ID: {job.file?.id ?? "—"}</li>
            <li>Filename: {job.file?.fileName ?? "—"}</li>
            <li>Size: {job.file?.byteSize ?? "—"}</li>
            <li>Hash: {hashFragment(job.file?.contentHash)}</li>
            <li>
              Verdict: <MalwareVerdictBadge verdict={malwareVerdict} />
            </li>
            <li>Security hold: {job.securityHold || quarantined ? "yes" : "no"}</li>
          </ul>
          <p role="status">
            Mapping, validation, approval, execution, and normal downloads are blocked. Malware
            payload details are not shown. Quarantine release is unavailable in this sprint.
          </p>
          <button
            type="button"
            disabled={Boolean(disabledReason(hasPermission, "import.validate"))}
            onClick={() => void handleRescan("Quarantine investigation rescan")}
          >
            Request rescan
          </button>
        </section>
      ) : null}

      {view === "mapping" && job ? (
        <section className="forge-ic-panel" aria-labelledby="mapping-heading">
          <h2 id="mapping-heading">Mapping workspace</h2>
          {quarantined ? (
            <p role="alert">Quarantined files cannot be mapped.</p>
          ) : (
            <>
              <p>Destination fields and transformations must match the backend mapping contract.</p>
              <table className="forge-ic-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Required</th>
                    <th>Sensitive</th>
                  </tr>
                </thead>
                <tbody>
                  {(mappings.length
                    ? mappings
                    : [
                        {
                          sourceColumn: "",
                          targetField: "",
                          isRequired: false,
                          isSensitive: false,
                          ordinal: 0,
                        },
                      ]
                  ).map((row, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          aria-label={`Source column ${index + 1}`}
                          value={row.sourceColumn}
                          onChange={(e) => {
                            const next = [...(mappings.length ? mappings : [row])];
                            next[index] = { ...next[index]!, sourceColumn: e.target.value };
                            setMappings(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Destination field ${index + 1}`}
                          value={row.targetField}
                          onChange={(e) => {
                            const next = [...(mappings.length ? mappings : [row])];
                            next[index] = { ...next[index]!, targetField: e.target.value };
                            setMappings(next);
                          }}
                        />
                      </td>
                      <td>{row.isRequired ? "Yes" : "No"}</td>
                      <td>
                        {row.isSensitive ? <SensitiveValue value="[MASKED]" sensitive /> : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() =>
                  setMappings((m) => [
                    ...m,
                    {
                      sourceColumn: "",
                      targetField: "",
                      isRequired: false,
                      ordinal: m.length,
                    },
                  ])
                }
              >
                Add mapping row
              </button>{" "}
              <button
                type="button"
                disabled={Boolean(disabledReason(hasPermission, "import.map"))}
                onClick={() => void handleAutoMap()}
              >
                Auto-map columns
              </button>{" "}
              <button
                type="button"
                disabled={Boolean(disabledReason(hasPermission, "import.map"))}
                onClick={() => void handleSaveMappings()}
              >
                Save mappings
              </button>
              <button
                type="button"
                disabled={Boolean(disabledReason(hasPermission, "import.validate"))}
                onClick={() => {
                  if (!jobId) return;
                  void (async () => {
                    try {
                      await api.requestValidation(jobId);
                      setView("validation");
                    } catch (err) {
                      reportError(err);
                    }
                  })();
                }}
              >
                Request validation
              </button>
            </>
          )}
        </section>
      ) : null}

      {view === "validation" && job ? (
        <section className="forge-ic-panel">
          <h2>Validation</h2>
          <p>Server validation is authoritative. Client checks are guidance only.</p>
          <button
            type="button"
            onClick={() => {
              if (!jobId) return;
              void (async () => {
                try {
                  const rows = await api.listErrors(jobId);
                  setErrors(Array.isArray(rows) ? rows : []);
                } catch (err) {
                  reportError(err);
                }
              })();
            }}
          >
            Refresh errors
          </button>
          <table className="forge-ic-table">
            <thead>
              <tr>
                {["Code", "Field", "Message", "Severity", "Fix"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((err) => (
                <tr key={err.id}>
                  <td>{err.ruleCode}</td>
                  <td>{err.fieldPath ?? "—"}</td>
                  <td>{err.message}</td>
                  <td>{err.severity}</td>
                  <td>{renderLookupAction(err)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            disabled={Boolean(disabledReason(hasPermission, "import.validate")) || !jobId}
            onClick={() => {
              if (!jobId) return;
              void (async () => {
                try {
                  await api.requestValidation(jobId);
                  const rows = await api.listErrors(jobId);
                  setErrors(Array.isArray(rows) ? rows : []);
                  setLookupNotice((prev) =>
                    prev ? `${prev} Validation refreshed.` : "Validation refreshed.",
                  );
                } catch (err) {
                  reportError(err);
                }
              })();
            }}
          >
            Re-validate
          </button>{" "}
          <button type="button" onClick={() => navigate("preview", jobId)}>
            Continue to preview
          </button>
        </section>
      ) : null}

      {view === "preview" && job ? (
        <section className="forge-ic-panel">
          <h2>Preview</h2>
          <p>
            Preview values are policy-filtered by the server. Sensitive samples render as masked.
          </p>
          <button
            type="button"
            disabled={Boolean(disabledReason(hasPermission, "import.preview"))}
            onClick={() => {
              if (!jobId) return;
              void api.requestPreview(jobId).catch(reportError);
            }}
          >
            Request preview
          </button>
          <table className="forge-ic-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Sample</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>email</td>
                <td>
                  <SensitiveValue value="j***@example.com" sensitive privileged={privileged} />
                </td>
              </tr>
              <tr>
                <td>password</td>
                <td>
                  <SensitiveValue value="********" sensitive neverReturnable />
                </td>
              </tr>
            </tbody>
          </table>
          <button type="button" onClick={() => navigate("duplicates", jobId)}>
            Duplicate review
          </button>
        </section>
      ) : null}

      {view === "duplicates" && job ? (
        <section className="forge-ic-panel">
          <h2>Duplicate review</h2>
          <p>No automatic merge action. Decisions are submitted to the server.</p>
          <button
            type="button"
            onClick={() => {
              if (!jobId) return;
              void (async () => {
                try {
                  const data = await api.listDuplicates({ jobId });
                  setDuplicates(Array.isArray(data) ? data : normalizeJobsPayload(data));
                } catch (err) {
                  reportError(err);
                }
              })();
            }}
          >
            Load candidates
          </button>
          <ul>
            {(
              duplicates as Array<{ id: string; confidence?: number; confidenceBand?: string }>
            ).map((d) => (
              <li key={d.id}>
                {d.id.slice(0, 8)}…{" "}
                <DuplicateConfidenceBadge
                  confidence={Number(d.confidence ?? 0)}
                  {...(d.confidenceBand ? { band: d.confidenceBand } : {})}
                />
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => navigate("approval", jobId)}>
            Continue to approval
          </button>
        </section>
      ) : null}

      {view === "approval" && job ? (
        <section className="forge-ic-panel">
          <h2>Approval</h2>
          <ul>
            <li>Job: {job.displayName}</li>
            <li>File: {job.file?.fileName}</li>
            <li>
              Malware: <MalwareVerdictBadge verdict={malwareVerdict} />
            </li>
            <li>Status: {job.status}</li>
          </ul>
          {quarantined || (malwareVerdict !== "CLEAN" && malwareVerdict !== "OVERRIDE_APPROVED") ? (
            <p role="alert">Approval is blocked until malware verdict is acceptable.</p>
          ) : (
            <button
              type="button"
              disabled={Boolean(disabledReason(hasPermission, "import.approve"))}
              onClick={() => void handleApprove()}
            >
              Approve
            </button>
          )}
          {disabledReason(hasPermission, "import.approve") ? (
            <p role="status">{disabledReason(hasPermission, "import.approve")}</p>
          ) : null}
        </section>
      ) : null}

      {view === "execute" && job ? (
        <section className="forge-ic-panel">
          <h2>Execute confirmation</h2>
          <p>
            Execution uses the backend control plane. The browser does not enqueue rows or send file
            contents.
          </p>
          <p>
            Current malware verdict: <MalwareVerdictBadge verdict={malwareVerdict} />
          </p>
          <button
            type="button"
            disabled={
              Boolean(disabledReason(hasPermission, "import.execute")) || job.status !== "APPROVED"
            }
            onClick={() => void handleExecute()}
          >
            Queue execution
          </button>
        </section>
      ) : null}

      {view === "execution" && job ? (
        <section className="forge-ic-panel" aria-live="polite">
          <h2>Execution monitor</h2>
          <p>Status: {String(statusPayload?.status ?? job.status)}</p>
          <ImportProgressBar
            percent={Number(statusPayload?.progressPercent ?? job.progressPercent ?? 0)}
            label="Execution progress"
          />
          <pre className="forge-ic-pre">
            {JSON.stringify(statusPayload?.rowCounts ?? {}, null, 2)}
          </pre>
          <button
            type="button"
            disabled={Boolean(disabledReason(hasPermission, "import.execute"))}
            onClick={() => {
              if (!jobId) return;
              if (!window.confirm("Request cancellation? Completed rows may remain committed."))
                return;
              void api.cancelExecution(jobId, {}).catch(reportError);
            }}
          >
            Request cancellation
          </button>
        </section>
      ) : null}

      {view === "results" && job ? (
        <section className="forge-ic-panel">
          <h2>Results</h2>
          <p>
            Final status: <ImportStatusBadge status={String(job.status)} />
          </p>
          <button
            type="button"
            onClick={() => {
              if (!jobId) return;
              void (async () => {
                try {
                  setResultsPayload(await api.getResults(jobId));
                  setErrors(await api.listErrors(jobId));
                } catch (err) {
                  reportError(err);
                }
              })();
            }}
          >
            Refresh results
          </button>
          <pre className="forge-ic-pre">{JSON.stringify(resultsPayload ?? {}, null, 2)}</pre>
          <div className="forge-ic-actions">
            <button type="button" onClick={() => void handleDownload("results", false)}>
              Download masked results
            </button>
            <button type="button" onClick={() => void handleDownload("errors", false)}>
              Download masked errors
            </button>
            <button type="button" onClick={() => void handleDownload("security")}>
              Download security report
            </button>
            {privileged ? (
              <button type="button" onClick={() => void handleDownload("results", true)}>
                Privileged results
              </button>
            ) : null}
            <button
              type="button"
              disabled={Boolean(disabledReason(hasPermission, "import.rollback"))}
              onClick={() => void handleRollback()}
            >
              Request rollback
            </button>
          </div>
          <p className="forge-ic-help">
            Rollback requests submit classification only. Full compensation is not implemented.
          </p>
          <h3>Errors</h3>
          <table className="forge-ic-table">
            <thead>
              <tr>
                {["Code", "Message", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((err) => (
                <tr key={err.id}>
                  <td>{err.ruleCode}</td>
                  <td>{err.message}</td>
                  <td>
                    <button
                      type="button"
                      disabled={Boolean(disabledReason(hasPermission, "import.error.reprocess"))}
                      onClick={() => void handleRetryError(err.id)}
                    >
                      Retry
                    </button>
                    {renderLookupAction(err)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {view === "profiles" ? (
        <section className="forge-ic-panel">
          <h2>Import profiles</h2>
          <p>
            Profile management requires import.profile.manage. Selection uses published profiles
            from the Import Platform API.
          </p>
          {!actionAllowed(hasPermission, "import.profile.manage") ? (
            <p role="status">Profile administration is hidden without import.profile.manage.</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void api.listProfiles().catch(reportError);
            }}
          >
            Load profiles
          </button>
        </section>
      ) : null}

      {view === "templates" ? (
        <section className="forge-ic-panel">
          <h2>Templates</h2>
          {!actionAllowed(hasPermission, "import.template.manage") &&
          !actionAllowed(hasPermission, "import.view") ? (
            <p role="status">Templates require import.view.</p>
          ) : (
            <button type="button" onClick={() => void api.listTemplates().catch(reportError)}>
              Load templates
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}

async function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
}

async function putPart(url: string, blob: Blob): Promise<string> {
  const res = await fetch(url, {
    method: "PUT",
    body: blob,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Part upload failed (${res.status})`);
  }
  const etag = res.headers.get("etag") ?? res.headers.get("ETag");
  if (!etag) {
    throw new Error("Part upload did not return ETag");
  }
  return etag.replaceAll('"', "");
}
