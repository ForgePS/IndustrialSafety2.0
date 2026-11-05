"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ForgePrintButton } from "@/components/forge-print-button";
import { Form300AEditor } from "@/components/osha/form-300a-editor";
import { Form300APrint } from "@/components/osha/form-300a-print";
import { OshaCaseEditor, type OshaCaseEditorSave } from "@/components/osha/osha-case-editor";
import { oshaCasePrintFieldValues } from "@/lib/module-print-fields";
import {
  buildForm300Csv,
  displayEmployeeName,
  emptyOshaForm300AMeta,
  filterOshaCases,
  form300ATotals,
  form300PrintIssues,
  incidentHref,
  INCIDENTS_API,
  isOshaFormLogCase,
  oshaLogEstablishmentKey,
  logCasesForForm300,
  OSHA_API,
  OSHA_FORM_300A_API,
  recordabilityBadgeClass,
  recordabilityLabel,
  summarizeOshaCases,
  toOshaCase,
  toOshaForm300AMeta,
  uniqueEstablishments,
  type OshaCase,
  type OshaForm300AMeta,
  type OshaRecordability,
} from "@/lib/osha-module";
import {
  buildForm300Pdf,
  fetchForm300Template,
  openForm300PdfForPrint,
} from "@/lib/osha-form-300-pdf";
import {
  buildForm301Pdf,
  fetchForm301Template,
  openForm301PdfForPrint,
} from "@/lib/osha-form-301-pdf";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};

type InjuryIncident = {
  id: string;
  title: string;
  employeeName: string;
  dateOccurred: string;
  hasOshaCase: boolean;
};

/** Matches the API maximum for /industrial/osha, so most tenants load in one request. */
const OSHA_LIST_PAGE_SIZE = 5000;

type PrintTarget = "300" | "300A" | "301" | null;

function isInjuryCategory(row: Record<string, unknown>): boolean {
  const cat = String(row.category ?? row.incidentCategory ?? "")
    .trim()
    .toLowerCase();
  return cat === "injuries" || cat === "injury";
}

function downloadText(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OshaWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.osha.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.osha.manage") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "OSHA",
    canView,
  });
  const [cases, setCases] = useState<OshaCase[]>([]);
  const [injuries, setInjuries] = useState<InjuryIncident[]>([]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [establishment, setEstablishment] = useState("all");
  // Sites are listed even with no OSHA cases, so a zero-case 300A can still be printed.
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [incidentId, setIncidentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [printing300, setPrinting300] = useState(false);
  const [printing301, setPrinting301] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [show300AEditor, setShow300AEditor] = useState(false);
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [form300AMeta, setForm300AMeta] = useState<OshaForm300AMeta>(() =>
    emptyOshaForm300AMeta(new Date().getFullYear()),
  );

  const loadCases = useCallback(async () => {
    if (!awsReady) return;
    setLoading(true);
    setError(null);
    try {
      // Forms 300/300A need every case, so page until the server total is reached.
      const items: Array<Record<string, unknown>> = [];
      for (let page = 1; ; page += 1) {
        const res = await apiGet<ListResponse>(OSHA_API, {
          query: { page: String(page), pageSize: String(OSHA_LIST_PAGE_SIZE) },
        });
        const batch = res.items ?? [];
        items.push(...batch);
        const total = typeof res.total === "number" ? res.total : null;
        if (
          batch.length === 0 ||
          (total != null ? items.length >= total : batch.length < OSHA_LIST_PAGE_SIZE)
        ) {
          break;
        }
      }
      setCases(items.map(toOshaCase));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load OSHA cases");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [awsReady]);

  const loadInjuries = useCallback(async () => {
    if (!awsReady || !canManage) return;
    try {
      const items: Array<Record<string, unknown>> = [];
      let page = 1;
      while (page <= 50) {
        const res = await apiGet<ListResponse>(INCIDENTS_API, {
          query: { category: "injuries", page: String(page), pageSize: "100" },
        });
        const batch = res.items ?? [];
        items.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      if (items.length === 0) {
        page = 1;
        while (page <= 50) {
          const res = await apiGet<ListResponse>(INCIDENTS_API, {
            query: { page: String(page), pageSize: "100" },
          });
          const batch = (res.items ?? []).filter(isInjuryCategory);
          items.push(...batch);
          if ((res.items ?? []).length < 100) break;
          page += 1;
        }
      }
      setInjuries(
        items.map((row) => ({
          id: String(row.id ?? ""),
          title: String(row.title ?? "Injury"),
          employeeName: String(row.employeeName ?? row.personAffected ?? row.workerName ?? ""),
          dateOccurred: String(row.dateOccurred ?? row.occurredAt ?? "").slice(0, 10),
          hasOshaCase: false,
        })),
      );
    } catch (e) {
      setInjuries([]);
      setError(e instanceof ApiError ? e.message : "Failed to load injury incidents");
    }
  }, [awsReady, canManage]);

  const loadSites = useCallback(async () => {
    if (!awsReady) return;
    try {
      const res = await apiGet<ListResponse>("/api/v1/industrial/sites", {
        query: { page: "1", pageSize: "500" },
      });
      setSites(
        (res.items ?? [])
          .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? "").trim() }))
          .filter((site) => site.id && site.name),
      );
    } catch {
      // Without site access the selector falls back to establishments named on cases.
      setSites([]);
    }
  }, [awsReady]);

  /** Site id for an establishment name: the site record first, then any case at that site. */
  const siteIdFor = useCallback(
    (name: string) =>
      sites.find((site) => site.name.toLowerCase() === name.toLowerCase())?.id ??
      cases.find(
        (c) =>
          oshaLogEstablishmentKey(c.establishment) === oshaLogEstablishmentKey(name) && c.siteId,
      )?.siteId ??
      undefined,
    [sites, cases],
  );

  // A string, not the siteIdFor function, so reloading cases does not refetch the 300A
  // meta and overwrite unsaved edits in the Form 300A editor.
  const selectedSiteId = establishment === "all" ? undefined : siteIdFor(establishment);

  const loadForm300AMeta = useCallback(async () => {
    if (!awsReady || establishment === "all") {
      setForm300AMeta(emptyOshaForm300AMeta(year));
      return;
    }
    try {
      const siteId = selectedSiteId;
      const res = await apiGet<Record<string, unknown>>(OSHA_FORM_300A_API, {
        query: {
          year: String(year),
          establishment,
          ...(siteId ? { siteId } : {}),
        },
      });
      setForm300AMeta(toOshaForm300AMeta(res, year));
    } catch {
      setForm300AMeta(emptyOshaForm300AMeta(year, establishment));
    }
  }, [awsReady, year, establishment, selectedSiteId]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadCases();
    void loadInjuries();
    void loadSites();
  }, [awsReady, loadCases, loadInjuries, loadSites]);

  useEffect(() => {
    void loadForm300AMeta();
  }, [loadForm300AMeta]);

  const establishments = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const name of [...sites.map((site) => site.name), ...uniqueEstablishments(cases)]) {
      if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [sites, cases]);
  const visible = useMemo(
    () => filterOshaCases(cases, { year, establishment }),
    [cases, year, establishment],
  );
  const summary = useMemo(() => summarizeOshaCases(visible), [visible]);
  const logCases = useMemo(() => logCasesForForm300(visible, year), [visible, year]);
  const totals300A = useMemo(() => form300ATotals(visible, year), [visible, year]);
  const logIssues = useMemo(
    () => form300PrintIssues(logCases, cases, year),
    [logCases, cases, year],
  );
  // OSHA 1904.30: each establishment keeps its own Form 300 and 300A.
  const perSite = establishment !== "all";
  const perSiteHint =
    "Select an establishment. OSHA requires a separate log and summary for each site.";

  useEffect(() => {
    if (establishment === "all" && establishments.length === 1) {
      setEstablishment(establishments[0]!);
    }
  }, [establishment, establishments]);

  /** Gate Form 300 / 300A output: one establishment, and a confirm when cases have problems. */
  function confirmLogReady(formName: string): boolean {
    if (!perSite) {
      setError(perSiteHint);
      return false;
    }
    if (logIssues.length === 0) return true;
    return window.confirm(
      `${logIssues.length} case(s) on the ${year} log have missing or inconsistent fields ` +
        `(listed under "Fix before printing"). ${formName} may be incomplete. Continue anyway?`,
    );
  }
  const selectedCase = useMemo(
    () => (selectedId ? (cases.find((c) => c.id === selectedId) ?? null) : null),
    [cases, selectedId],
  );

  const linkedIncidentIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) {
      if (c.incidentId) set.add(c.incidentId);
    }
    return set;
  }, [cases]);

  const injuryOptions = useMemo(() => {
    return injuries
      .filter((i) => i.id)
      .map((i) => ({ ...i, hasOshaCase: linkedIncidentIds.has(i.id) }))
      .sort((a, b) => {
        if (a.hasOshaCase !== b.hasOshaCase) return a.hasOshaCase ? 1 : -1;
        return (b.dateOccurred || "").localeCompare(a.dateOccurred || "");
      });
  }, [injuries, linkedIncidentIds]);

  const openableInjuries = useMemo(
    () => injuryOptions.filter((i) => !i.hasOshaCase),
    [injuryOptions],
  );

  function formatInjuryOption(inc: InjuryIncident): string {
    return [inc.title, inc.employeeName || null, inc.dateOccurred || null]
      .filter(Boolean)
      .join(" · ");
  }

  function onIncidentChange(nextId: string) {
    if (nextId && linkedIncidentIds.has(nextId)) {
      setIncidentId("");
      return;
    }
    setIncidentId(nextId);
  }

  async function onCreateFromIncident(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !incidentId) return;
    if (linkedIncidentIds.has(incidentId)) {
      setError("That injury incident already has an OSHA case.");
      setIncidentId("");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await apiSend<Record<string, unknown>>(OSHA_API, "POST", { incidentId });
      setIncidentId("");
      await loadCases();
      await loadInjuries();
      const id = String(created.id ?? "");
      if (id) setSelectedId(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open OSHA case");
    } finally {
      setCreating(false);
    }
  }

  async function setRecordability(id: string, recordabilityStatus: OshaRecordability) {
    if (!canManage) return;
    setSavingId(id);
    setError(null);
    try {
      await apiSend(`${OSHA_API}/${id}`, "PATCH", { recordabilityStatus });
      await loadCases();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update recordability");
    } finally {
      setSavingId(null);
    }
  }

  async function saveCase(body: OshaCaseEditorSave) {
    if (!selectedId || !canManage) return;
    setSavingId(selectedId);
    setError(null);
    try {
      await apiSend(`${OSHA_API}/${selectedId}`, "PATCH", body);
      await loadCases();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save OSHA case");
      throw err;
    } finally {
      setSavingId(null);
    }
  }

  async function saveForm300AMeta() {
    if (!canManage || establishment === "all") {
      setError("Select a specific establishment before saving Form 300A information.");
      return;
    }
    setSavingMeta(true);
    setError(null);
    try {
      const siteId = siteIdFor(establishment);
      const saved = await apiSend<Record<string, unknown>>(OSHA_FORM_300A_API, "PUT", {
        ...form300AMeta,
        year,
        establishment,
        ...(siteId ? { siteId } : {}),
      });
      setForm300AMeta(toOshaForm300AMeta(saved, year));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save Form 300A information");
    } finally {
      setSavingMeta(false);
    }
  }

  function exportForm300() {
    if (!confirmLogReady("The Form 300 export")) return;
    const csv = buildForm300Csv(visible, year);
    downloadText(`osha-form-300-${year}.csv`, csv);
  }

  async function printForm300Pdf() {
    setError(null);
    setPrinting300(true);
    try {
      const template = await fetchForm300Template();
      const establishmentName =
        establishment === "all"
          ? form300AMeta.establishmentName || "All establishments"
          : establishment;
      const pdfBytes = await buildForm300Pdf(
        template,
        {
          year,
          establishment: establishmentName,
          city: form300AMeta.city,
          state: form300AMeta.state,
        },
        logCases,
      );
      const warn = openForm300PdfForPrint(pdfBytes, `osha-form-300-${year}.pdf`);
      if (warn) setError(warn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build Form 300 PDF");
    } finally {
      setPrinting300(false);
    }
  }

  async function printForm301Pdf(caseId: string) {
    const caseRow = cases.find((c) => c.id === caseId);
    if (!caseRow) {
      setError("OSHA case not found for Form 301.");
      return;
    }
    if (!isOshaFormLogCase(caseRow.recordabilityStatus)) {
      setError("Form 301 is only for recordable or privacy cases. Mark the case recordable first.");
      return;
    }
    setError(null);
    setPrinting301(true);
    try {
      const template = await fetchForm301Template();
      const pdfBytes = await buildForm301Pdf(template, caseRow);
      const label = caseRow.caseNumber || caseRow.id.slice(0, 8);
      const warn = openForm301PdfForPrint(pdfBytes, `osha-form-301-${label}.pdf`);
      if (warn) setError(warn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build Form 301 PDF");
    } finally {
      setPrinting301(false);
    }
  }

  function runPrint(target: Exclude<PrintTarget, null>, caseId?: string) {
    if (target === "300" && !confirmLogReady("Form 300")) return;
    if (target === "300A" && !confirmLogReady("Form 300A")) return;
    if (target === "300") {
      void printForm300Pdf();
      return;
    }
    if (target === "301") {
      if (!caseId) {
        setError("Select a case before printing Form 301.");
        return;
      }
      void printForm301Pdf(caseId);
      return;
    }
    setPrintTarget(target);
  }

  useEffect(() => {
    if (!printTarget) return;
    const clear = () => setPrintTarget(null);
    window.addEventListener("afterprint", clear);
    const timer = window.setTimeout(() => {
      window.print();
    }, 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printTarget]);

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view OSHA recordkeeping.</p>
      </div>
    );
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  return (
    <section
      aria-labelledby="osha-title"
      className="osha-workspace"
      data-walkthrough="osha-dashboard"
      data-print-target={printTarget ?? ""}
    >
      <ModuleWorkspaceHeader
        id="osha-title"
        eyebrow="Incident & Claims"
        title={moduleName}
        description="OSHA Forms 300, 300A, and 301. Forms 300 and 301 print on the official fillable PDFs. Form 301 case numbers and narratives autofill from Form 300; Form 300A totals sum each Form 300 page."
        onRefresh={() => void loadCases()}
        refreshing={loading}
      />

      {error ? (
        <div
          className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4"
          role="alert"
        >
          <span className="flex-grow-1">{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => void loadCases()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="card mb-4 osha-workspace__filters">
        <div className="card-body">
          <div className="osha-workspace__filter-row">
            <label className="form-label mb-0" htmlFor="osha-year">
              Calendar year
              <input
                id="osha-year"
                className="form-control mt-1"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(ev) => setYear(Number(ev.target.value) || new Date().getFullYear())}
              />
            </label>
            <label className="form-label mb-0" htmlFor="osha-establishment">
              Establishment
              <select
                id="osha-establishment"
                className="form-select mt-1"
                value={establishment}
                onChange={(ev) => setEstablishment(ev.target.value)}
              >
                <option value="all">All establishments</option>
                {establishments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="osha-workspace__filter-actions">
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-walkthrough="osha-300-log"
                onClick={exportForm300}
                disabled={!perSite}
                title={perSite ? undefined : perSiteHint}
              >
                Export Form 300 (CSV)
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => runPrint("300")}
                disabled={printing300 || !perSite}
                title={perSite ? undefined : perSiteHint}
              >
                {printing300 ? "Preparing Form 300…" : "Print Form 300"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-walkthrough="osha-300a"
                onClick={() => runPrint("300A")}
                disabled={!perSite}
                title={perSite ? undefined : perSiteHint}
              >
                Print Form 300A
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShow300AEditor((v) => !v)}
                disabled={establishment === "all"}
                title={
                  establishment === "all"
                    ? "Select an establishment to edit Form 300A information"
                    : undefined
                }
              >
                {show300AEditor ? "Hide Form 300A editor" : "Edit Form 300A"}
              </button>
            </div>
          </div>
          <p className="text-muted small mb-0 mt-3">
            {summary.recordable + summary.privacy} recordable / privacy case(s) in {year}.
            {summary.pending > 0 ? ` ${summary.pending} pending review.` : ""} {logCases.length} on
            Form 300 log.
          </p>
          {!perSite ? <p className="small text-muted mb-0 mt-2">{perSiteHint}</p> : null}
          {logIssues.length > 0 ? (
            <div
              className="alert alert-warning mt-3 mb-0"
              role="status"
              data-testid="osha-log-issues"
            >
              <strong>Fix before printing:</strong> {logIssues.length} case(s) on the {year} log
              have missing or inconsistent fields. Forms 300 and 300A may be wrong until they are
              fixed.
              <ul className="mb-0 mt-2">
                {logIssues.map((item) => (
                  <li key={item.caseId}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 align-baseline"
                      onClick={() => setSelectedId(item.caseId)}
                    >
                      {item.label}
                    </button>
                    : {item.issues.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {show300AEditor && establishment !== "all" ? (
        <Form300AEditor
          meta={form300AMeta}
          canManage={canManage}
          saving={savingMeta}
          onChange={setForm300AMeta}
          onSave={saveForm300AMeta}
        />
      ) : null}

      {selectedCase ? (
        <OshaCaseEditor
          caseRow={selectedCase}
          canManage={canManage}
          saving={savingId === selectedCase.id}
          onSave={saveCase}
          onClose={() => setSelectedId(null)}
          onPrint301={() => runPrint("301", selectedCase.id)}
          printing301={printing301}
        />
      ) : null}

      {canManage ? (
        <div className="card mb-4 osha-workspace__create">
          <div className="card-body">
            <form className="osha-workspace__create-row" onSubmit={onCreateFromIncident}>
              <label className="form-label mb-0 flex-grow-1" htmlFor="osha-incident">
                Injury incident <span className="text-danger">*</span>
                <select
                  id="osha-incident"
                  className="form-select mt-1"
                  required={openableInjuries.length > 0}
                  value={incidentId}
                  onChange={(ev) => onIncidentChange(ev.target.value)}
                >
                  <option value="">— Select incident —</option>
                  {openableInjuries.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {formatInjuryOption(inc)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="btn btn-success"
                disabled={creating || !incidentId || openableInjuries.length === 0}
              >
                {creating ? "Opening…" : "Open OSHA case from incident"}
              </button>
            </form>
            {injuryOptions.length === 0 ? (
              <p className="text-muted small mb-0 mt-2">
                No injury incidents found yet. Create an injury in Incidents first.
              </p>
            ) : openableInjuries.length === 0 ? (
              <p className="text-muted small mb-0 mt-2">
                All {injuryOptions.length} injury incident
                {injuryOptions.length === 1 ? "" : "s"} already{" "}
                {injuryOptions.length === 1 ? "has" : "have"} an OSHA case.
              </p>
            ) : (
              <p className="text-muted small mb-0 mt-2">
                {openableInjuries.length} of {injuryOptions.length} injury incident
                {injuryOptions.length === 1 ? "" : "s"} available to open.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="card osha-workspace__table-card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">Case no.</th>
                <th scope="col">Incident</th>
                <th scope="col">Employee</th>
                <th scope="col">Injury date</th>
                <th scope="col">Recordability</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    Loading OSHA cases…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No OSHA cases for this year
                    {establishment !== "all" ? " and establishment" : ""}.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.id}>
                    <td>{row.caseNumber || "—"}</td>
                    <td>
                      {row.incidentId ? (
                        <Link href={incidentHref(row.incidentId)}>{row.title}</Link>
                      ) : (
                        row.title
                      )}
                    </td>
                    <td>{displayEmployeeName(row)}</td>
                    <td>{row.injuryDate || "—"}</td>
                    <td>
                      <span className={`badge ${recordabilityBadgeClass(row.recordabilityStatus)}`}>
                        {recordabilityLabel(row.recordabilityStatus)}
                      </span>
                    </td>
                    <td>{row.reviewer || "Pending"}</td>
                    <td>
                      <div className="osha-workspace__row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setSelectedId(row.id)}
                        >
                          Open forms
                        </button>
                        <ForgePrintButton
                          module="OSHA"
                          recordType="osha_case"
                          recordId={row.id}
                          fieldValues={oshaCasePrintFieldValues(
                            row as unknown as Record<string, unknown>,
                          )}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={printing301 || !isOshaFormLogCase(row.recordabilityStatus)}
                          title={
                            isOshaFormLogCase(row.recordabilityStatus)
                              ? undefined
                              : "Form 301 is only for recordable or privacy cases"
                          }
                          onClick={() => runPrint("301", row.id)}
                        >
                          {printing301 ? "Preparing…" : "Print 301"}
                        </button>
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              disabled={savingId === row.id}
                              onClick={() => void setRecordability(row.id, "RECORDABLE")}
                            >
                              Recordable
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={savingId === row.id}
                              onClick={() => void setRecordability(row.id, "NOT_RECORDABLE")}
                            >
                              Not recordable
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              disabled={savingId === row.id}
                              onClick={() => void setRecordability(row.id, "PRIVACY_CASE")}
                            >
                              Privacy case
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="osha-workspace__print-only" aria-hidden="true">
        {printTarget === "300A" ? (
          <div className="osha-workspace__print-sheet" data-print-form="300A">
            <Form300APrint
              totals={totals300A}
              meta={{
                ...form300AMeta,
                year,
                establishmentName:
                  form300AMeta.establishmentName || (establishment === "all" ? "" : establishment),
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
