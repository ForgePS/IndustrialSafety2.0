"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  SEASONAL_LIFECYCLE_FLAG,
  isSeasonalLifecycleEnabled,
  seasonalLifecycleBadge,
  seasonalLifecycleBadgeClass,
} from "@/lib/personnel-seasonal";

type Bootstrap = {
  industrialEnabled: boolean;
  flags?: Record<string, boolean>;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

type Season = {
  id: string;
  name: string;
  code: string;
  status: string;
  startDate?: string | null;
  expectedEndDate?: string | null;
};

type Metrics = {
  seasonId: string | null;
  total: number;
  byPersonStatus: Record<string, number>;
  byHiringStatus: Record<string, number>;
  byAssignmentStatus: Record<string, number>;
  byOrientationStatus: Record<string, number>;
  byFullTimeConsiderationStatus: Record<string, number>;
  byEmploymentType: Record<string, number>;
};

type SeasonalRow = {
  engagementId: string;
  personnelId: string;
  displayName: string | null;
  preferredName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  seasonId?: string | null;
  seasonName?: string | null;
  personStatus: string;
  employmentType: string;
  hiringStatus: string;
  assignmentStatus: string;
  orientationStatus: string;
  fullTimeConsiderationStatus: string;
  startDate?: string | null;
  expectedEndDate?: string | null;
  employeeNumber?: string | null;
  facilityName?: string | null;
  departmentName?: string | null;
  positionName?: string | null;
  supervisorName?: string | null;
  shiftName?: string | null;
};

type SearchHit = {
  personnelId: string;
  displayName: string | null;
  preferredName?: string | null;
  employeeNumber?: string | null;
  email?: string | null;
  status?: string | null;
};

type OrientationSession = {
  id: string;
  name: string;
  seasonId?: string | null;
  templateId: string;
  templateName?: string | null;
  location?: string | null;
  sessionDate: string;
  status: string;
  attendeeCount?: number;
};

type OrientationTemplate = {
  id: string;
  name: string;
  orientationType?: string;
  active?: boolean;
};

type SessionDetail = {
  session: OrientationSession & { notes?: string | null };
  attendees: Array<{
    id: string;
    personnelId: string;
    displayName: string | null;
    attendanceStatus: string;
    orientationStatus: string;
  }>;
};

type Lifecycle = {
  personnel: Record<string, unknown>;
  currentEngagement: Record<string, unknown> | null;
  engagements: Array<Record<string, unknown>>;
  fullTimeConsiderations: Array<Record<string, unknown>>;
  recentEvents: Array<Record<string, unknown>>;
  orientation?: { attendance: Array<Record<string, unknown>> };
};

type EmploymentHistory = {
  personnelId: string;
  engagements: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

type TabId = "dashboard" | "prehire" | "orientation" | "workforce";

type ConfirmKind = "activate" | "convert" | "not-hired" | null;

const HIRING_DECISIONS = ["APPROVED", "HOLD", "NOT_HIRED", "WITHDRAWN", "NO_SHOW"] as const;
const FT_STATUSES = [
  "NOT_EVALUATED",
  "RECOMMENDED",
  "CONSIDER",
  "DO_NOT_RECOMMEND",
  "OFFER_PENDING",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "CONVERTED",
] as const;

const emptyAssignment = {
  employeeNumber: "",
  facilityName: "",
  departmentName: "",
  positionName: "",
  supervisorName: "",
  shiftName: "",
};

const SEASONAL_TABS = [
  { id: "dashboard" as const, label: "Dashboard" },
  { id: "prehire" as const, label: "Pre-Hire" },
  { id: "orientation" as const, label: "Orientation" },
  { id: "workforce" as const, label: "Workforce" },
];

const ASSIGNMENT_FIELDS = [
  ["employeeNumber", "Employee number"],
  ["facilityName", "Facility"],
  ["departmentName", "Department"],
  ["positionName", "Position"],
  ["supervisorName", "Supervisor"],
  ["shiftName", "Shift"],
] as const;

function SeasonalBadge({
  row,
}: {
  row: { personStatus?: string | null; employmentType?: string | null };
}) {
  const badge = seasonalLifecycleBadge(row);
  return <span className={`badge ${seasonalLifecycleBadgeClass(badge.kind)}`}>{badge.label}</span>;
}

function FormField({
  label,
  htmlFor,
  children,
  className = "col-md-6 col-lg-4",
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ActionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card mb-3">
      <div className="card-header py-2">
        <h6 className="card-title mb-0">{title}</h6>
      </div>
      <div className="card-body">
        <div className="row g-3">{children}</div>
      </div>
    </div>
  );
}

function AssignmentInputs<T extends Record<(typeof ASSIGNMENT_FIELDS)[number][0], string>>({
  idPrefix,
  form,
  setForm,
}: {
  idPrefix: string;
  form: T;
  setForm: (updater: (current: T) => T) => void;
}) {
  return ASSIGNMENT_FIELDS.map(([key, label]) => (
    <FormField key={key} label={label} htmlFor={`${idPrefix}-${key}`}>
      <input
        id={`${idPrefix}-${key}`}
        className="form-control"
        value={form[key]}
        onChange={(ev) => setForm((current) => ({ ...current, [key]: ev.target.value }))}
      />
    </FormField>
  ));
}

function opt(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function metricEntries(bag: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(bag ?? {}).sort((a, b) => b[1] - a[1]);
}

export function SeasonalWorkforceWorkspace({
  onGoToRoster,
}: {
  onGoToRoster?: () => void;
}) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.personnel.manage") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("dashboard");

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [workers, setWorkers] = useState<SeasonalRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [seasonForm, setSeasonForm] = useState({
    name: "",
    code: "",
    description: "",
    startDate: "",
    expectedEndDate: "",
    status: "DRAFT",
  });
  const [creatingSeason, setCreatingSeason] = useState(false);

  const [prehire, setPrehire] = useState({
    firstName: "",
    lastName: "",
    preferredName: "",
    email: "",
    phone: "",
    notes: "",
    existingPersonnelId: "",
  });
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [creatingPrehire, setCreatingPrehire] = useState(false);

  const [templates, setTemplates] = useState<OrientationTemplate[]>([]);
  const [sessions, setSessions] = useState<OrientationSession[]>([]);
  const [sessionForm, setSessionForm] = useState({
    templateId: "",
    name: "",
    location: "",
    sessionDate: "",
    instructorName: "",
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [attendeePersonnelId, setAttendeePersonnelId] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [history, setHistory] = useState<EmploymentHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [hiringStatus, setHiringStatus] = useState<(typeof HIRING_DECISIONS)[number]>("APPROVED");
  const [hiringNotes, setHiringNotes] = useState("");
  const [activateForm, setActivateForm] = useState({
    effectiveDate: "",
    expectedEndDate: "",
    ...emptyAssignment,
  });
  const [assignmentForm, setAssignmentForm] = useState({ ...emptyAssignment, assignmentStatus: "UNASSIGNED" });
  const [ftStatus, setFtStatus] = useState<(typeof FT_STATUSES)[number]>("RECOMMENDED");
  const [ftNotes, setFtNotes] = useState("");
  const [convertForm, setConvertForm] = useState({
    effectiveDate: "",
    ...emptyAssignment,
  });

  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const seasonalEnabled = isSeasonalLifecycleEnabled(bootstrap?.flags);
  const personnelModuleOn = Boolean(
    bootstrap?.industrialEnabled &&
      bootstrap?.modules.find((m) => m.code === "PERSONNEL")?.awsEnabled,
  );
  const ready = Boolean(bootstrap && canView && personnelModuleOn && seasonalEnabled);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof ApiError ? e.message : "Failed to load bootstrap");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSeasons = useCallback(async () => {
    const data = await apiGet<{ items: Season[] }>("/api/v1/industrial/personnel/seasons", {
      query: { page: "1", pageSize: "100" },
    });
    setSeasons(data.items ?? []);
    setSeasonId((prev) => {
      if (prev && (data.items ?? []).some((s) => s.id === prev)) return prev;
      return data.items?.[0]?.id ?? "";
    });
  }, []);

  const loadMetrics = useCallback(async (sid: string) => {
    if (!sid) {
      setMetrics(null);
      return;
    }
    const data = await apiGet<Metrics>("/api/v1/industrial/personnel/seasonal/metrics", {
      query: { seasonId: sid },
    });
    setMetrics(data);
  }, []);

  const loadWorkers = useCallback(async (sid: string) => {
    if (!sid) {
      setWorkers([]);
      return;
    }
    setLoadingList(true);
    try {
      const data = await apiGet<{ items: SeasonalRow[] }>("/api/v1/industrial/personnel/seasonal", {
        query: { seasonId: sid, page: "1", pageSize: "100" },
      });
      setWorkers(data.items ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadOrientation = useCallback(async (sid: string) => {
    const [tpl, sess] = await Promise.all([
      apiGet<{ items?: OrientationTemplate[] } | OrientationTemplate[]>(
        "/api/v1/industrial/personnel/orientation/templates",
        { query: { activeOnly: "true" } },
      ),
      apiGet<{ items: OrientationSession[] }>("/api/v1/industrial/personnel/orientation/sessions", {
        query: { seasonId: sid || undefined, page: "1", pageSize: "50" },
      }),
    ]);
    const templateItems = Array.isArray(tpl) ? tpl : (tpl.items ?? []);
    setTemplates(templateItems);
    setSessions(sess.items ?? []);
    setSessionForm((f) => ({
      ...f,
      templateId: f.templateId || templateItems[0]?.id || "",
    }));
  }, []);

  const refreshSeasonData = useCallback(
    async (sid: string) => {
      setError(null);
      try {
        await Promise.all([loadMetrics(sid), loadWorkers(sid), loadOrientation(sid)]);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load seasonal data");
      }
    },
    [loadMetrics, loadWorkers, loadOrientation],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadSeasons();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load seasons");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, loadSeasons]);

  useEffect(() => {
    if (!ready || !seasonId) return;
    void refreshSeasonData(seasonId);
  }, [ready, seasonId, refreshSeasonData]);

  async function openDetail(personnelId: string) {
    setSelectedId(personnelId);
    setDetailLoading(true);
    setError(null);
    try {
      const [life, hist] = await Promise.all([
        apiGet<Lifecycle>(`/api/v1/industrial/personnel/${personnelId}/lifecycle`),
        apiGet<EmploymentHistory>(`/api/v1/industrial/personnel/${personnelId}/employment-history`),
      ]);
      setLifecycle(life);
      setHistory(hist);
      const eng = life.currentEngagement ?? {};
      setAssignmentForm({
        assignmentStatus: String(eng.assignmentStatus ?? "UNASSIGNED"),
        employeeNumber: String(eng.employeeNumber ?? ""),
        facilityName: String(eng.facilityName ?? ""),
        departmentName: String(eng.departmentName ?? ""),
        positionName: String(eng.positionName ?? ""),
        supervisorName: String(eng.supervisorName ?? ""),
        shiftName: String(eng.shiftName ?? ""),
      });
      setFtStatus(
        (String(eng.fullTimeConsiderationStatus ?? "NOT_EVALUATED") as (typeof FT_STATUSES)[number]) ||
          "NOT_EVALUATED",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load lifecycle");
      setLifecycle(null);
      setHistory(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function onCreateSeason(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreatingSeason(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/personnel/seasons", "POST", {
        name: seasonForm.name.trim(),
        code: seasonForm.code.trim(),
        description: opt(seasonForm.description),
        startDate: opt(seasonForm.startDate),
        expectedEndDate: opt(seasonForm.expectedEndDate),
        status: seasonForm.status,
      });
      setSeasonForm({
        name: "",
        code: "",
        description: "",
        startDate: "",
        expectedEndDate: "",
        status: "DRAFT",
      });
      await loadSeasons();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create season failed");
    } finally {
      setCreatingSeason(false);
    }
  }

  async function onSearchReturning() {
    if (!searchQ.trim()) {
      setSearchHits([]);
      return;
    }
    try {
      const data = await apiGet<{ items: SearchHit[] }>("/api/v1/industrial/personnel/search", {
        query: { q: searchQ.trim(), limit: "20" },
      });
      setSearchHits(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed");
    }
  }

  async function onCreatePrehire(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !seasonId) return;
    setCreatingPrehire(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/personnel/prehire", "POST", {
        seasonId,
        firstName: prehire.firstName.trim(),
        lastName: prehire.lastName.trim(),
        preferredName: opt(prehire.preferredName),
        email: opt(prehire.email),
        phone: opt(prehire.phone),
        notes: opt(prehire.notes),
        existingPersonnelId: opt(prehire.existingPersonnelId),
      });
      setPrehire({
        firstName: "",
        lastName: "",
        preferredName: "",
        email: "",
        phone: "",
        notes: "",
        existingPersonnelId: "",
      });
      setSearchHits([]);
      setSearchQ("");
      await refreshSeasonData(seasonId);
      setTab("workforce");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pre-hire create failed");
    } finally {
      setCreatingPrehire(false);
    }
  }

  async function onCreateSession(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    try {
      await apiSend("/api/v1/industrial/personnel/orientation/sessions", "POST", {
        templateId: sessionForm.templateId,
        seasonId: seasonId || null,
        name: sessionForm.name.trim(),
        location: opt(sessionForm.location),
        sessionDate: sessionForm.sessionDate,
        instructorName: opt(sessionForm.instructorName),
        status: "SCHEDULED",
      });
      setSessionForm((f) => ({ ...f, name: "", location: "", sessionDate: "", instructorName: "" }));
      await loadOrientation(seasonId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create session failed");
    }
  }

  async function openSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    try {
      const detail = await apiGet<SessionDetail>(
        `/api/v1/industrial/personnel/orientation/sessions/${sessionId}`,
      );
      setSessionDetail(detail);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load session");
      setSessionDetail(null);
    }
  }

  async function addAttendee() {
    if (!canManage || !selectedSessionId || !attendeePersonnelId.trim()) return;
    try {
      await apiSend(
        `/api/v1/industrial/personnel/orientation/sessions/${selectedSessionId}/attendees`,
        "POST",
        { personnelIds: [attendeePersonnelId.trim()], attendanceStatus: "SCHEDULED" },
      );
      setAttendeePersonnelId("");
      await openSession(selectedSessionId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Add attendee failed");
    }
  }

  async function patchAttendance(attendeeId: string, attendanceStatus: "PRESENT" | "NO_SHOW") {
    if (!canManage || !selectedSessionId) return;
    try {
      await apiSend(
        `/api/v1/industrial/personnel/orientation/sessions/${selectedSessionId}/attendees/${attendeeId}`,
        "PATCH",
        { attendanceStatus },
      );
      await openSession(selectedSessionId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update attendance failed");
    }
  }

  async function completeOrientation(personnelId: string) {
    if (!canManage || !selectedSessionId) return;
    try {
      await apiSend(`/api/v1/industrial/personnel/${personnelId}/orientation/complete`, "POST", {
        sessionId: selectedSessionId,
      });
      await openSession(selectedSessionId);
      if (selectedId === personnelId) await openDetail(personnelId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Complete orientation failed");
    }
  }

  async function submitHiringDecision() {
    if (!canManage || !selectedId) return;
    if (hiringStatus === "NOT_HIRED") {
      setConfirm("not-hired");
      return;
    }
    await runHiringDecision();
  }

  async function runHiringDecision() {
    if (!canManage || !selectedId) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${selectedId}/hiring-decision`, "POST", {
        hiringStatus,
        notes: opt(hiringNotes),
      });
      setHiringNotes("");
      setConfirm(null);
      await openDetail(selectedId);
      await loadWorkers(seasonId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Hiring decision failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function runActivate() {
    if (!canManage || !selectedId) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${selectedId}/activate-seasonal`, "POST", {
        effectiveDate: activateForm.effectiveDate,
        expectedEndDate: opt(activateForm.expectedEndDate),
        employeeNumber: opt(activateForm.employeeNumber),
        facilityName: opt(activateForm.facilityName),
        departmentName: opt(activateForm.departmentName),
        positionName: opt(activateForm.positionName),
        supervisorName: opt(activateForm.supervisorName),
        shiftName: opt(activateForm.shiftName),
      });
      setConfirm(null);
      await openDetail(selectedId);
      await refreshSeasonData(seasonId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activate seasonal failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function saveAssignment() {
    if (!canManage || !selectedId) return;
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${selectedId}/assignment`, "PATCH", {
        assignmentStatus: assignmentForm.assignmentStatus || undefined,
        employeeNumber: opt(assignmentForm.employeeNumber),
        facilityName: opt(assignmentForm.facilityName),
        departmentName: opt(assignmentForm.departmentName),
        positionName: opt(assignmentForm.positionName),
        supervisorName: opt(assignmentForm.supervisorName),
        shiftName: opt(assignmentForm.shiftName),
      });
      await openDetail(selectedId);
      await loadWorkers(seasonId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update assignment failed");
    }
  }

  async function saveFtConsideration() {
    if (!canManage || !selectedId) return;
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${selectedId}/full-time-consideration`, "POST", {
        status: ftStatus,
        notes: opt(ftNotes),
      });
      setFtNotes("");
      await openDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Full-time consideration failed");
    }
  }

  async function runConvert() {
    if (!canManage || !selectedId) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/personnel/${selectedId}/convert-full-time`, "POST", {
        effectiveDate: convertForm.effectiveDate,
        employeeNumber: opt(convertForm.employeeNumber),
        facilityName: opt(convertForm.facilityName),
        departmentName: opt(convertForm.departmentName),
        positionName: opt(convertForm.positionName),
        supervisorName: opt(convertForm.supervisorName),
        shiftName: opt(convertForm.shiftName),
      });
      setConfirm(null);
      await openDetail(selectedId);
      await refreshSeasonData(seasonId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Convert to full-time failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-lock-alt fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">Seasonal Workforce</h5>
          <p className="mb-0">
            You do not have permission to view personnel. Missing{" "}
            <code>industrial.personnel.view</code>.
          </p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="alert alert-danger" role="alert">
        <h5 className="alert-heading mb-1">Seasonal Workforce</h5>
        <p className="mb-0">{bootError}</p>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <p className="text-muted" role="status" aria-live="polite">
        Checking feature availability…
      </p>
    );
  }

  if (!personnelModuleOn) {
    return (
      <div className="alert alert-warning" role="alert">
        <h5 className="alert-heading mb-1">Seasonal Workforce</h5>
        <p className="mb-0">The Personnel module is not enabled for your organization.</p>
      </div>
    );
  }

  if (!seasonalEnabled) {
    return (
      <div className="alert alert-info d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-info-circle fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">Seasonal Workforce</h5>
          <p className="mb-2">
            Seasonal pre-hire lifecycle is not enabled for this tenant. Flag{" "}
            <code>{SEASONAL_LIFECYCLE_FLAG}</code> is off.
          </p>
          {onGoToRoster ? (
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={onGoToRoster}>
              Open standard personnel roster
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const selectedWorker = workers.find((w) => w.personnelId === selectedId);
  const eng = lifecycle?.currentEngagement;
  const displayName =
    selectedWorker?.displayName ||
    (eng ? String(eng.displayName ?? "") : "") ||
    String(lifecycle?.personnel?.displayName ?? "Worker");

  return (
    <section aria-labelledby="seasonal-title">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <h4 className="mb-1" id="seasonal-title">
            Seasonal Workforce
          </h4>
          <p className="text-muted mb-0">
            Pre-hire intake, orientation, activation, and full-time conversion.
          </p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body py-3">
          <div className="row g-2 align-items-end">
            <div className="col-md-6 col-lg-5">
              <label className="form-label" htmlFor="seasonal-season-select">
                Season
              </label>
              <select
                id="seasonal-season-select"
                className="form-select"
                value={seasonId}
                onChange={(ev) => setSeasonId(ev.target.value)}
                aria-label="Select season"
              >
                {seasons.length === 0 ? <option value="">No seasons yet</option> : null}
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}) · {s.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-auto">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => void refreshSeasonData(seasonId)}
                disabled={!seasonId}
              >
                <i className="bx bx-refresh me-1" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {canManage ? (
        <form className="card mb-3" onSubmit={(e) => void onCreateSeason(e)} aria-label="Create season">
          <div className="card-header">
            <h5 className="card-title mb-0">Create season</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <FormField label="Name *" htmlFor="season-name">
                <input
                  id="season-name"
                  className="form-control"
                  required
                  value={seasonForm.name}
                  onChange={(ev) => setSeasonForm((f) => ({ ...f, name: ev.target.value }))}
                />
              </FormField>
              <FormField label="Code *" htmlFor="season-code">
                <input
                  id="season-code"
                  className="form-control"
                  required
                  value={seasonForm.code}
                  onChange={(ev) => setSeasonForm((f) => ({ ...f, code: ev.target.value }))}
                />
              </FormField>
              <FormField label="Start date" htmlFor="season-start">
                <input
                  id="season-start"
                  type="date"
                  className="form-control"
                  value={seasonForm.startDate}
                  onChange={(ev) => setSeasonForm((f) => ({ ...f, startDate: ev.target.value }))}
                />
              </FormField>
              <FormField label="Expected end" htmlFor="season-end">
                <input
                  id="season-end"
                  type="date"
                  className="form-control"
                  value={seasonForm.expectedEndDate}
                  onChange={(ev) =>
                    setSeasonForm((f) => ({ ...f, expectedEndDate: ev.target.value }))
                  }
                />
              </FormField>
              <FormField label="Status" htmlFor="season-status">
                <select
                  id="season-status"
                  className="form-select"
                  value={seasonForm.status}
                  onChange={(ev) => setSeasonForm((f) => ({ ...f, status: ev.target.value }))}
                >
                  {["DRAFT", "OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Description" htmlFor="season-description" className="col-12">
                <input
                  id="season-description"
                  className="form-control"
                  value={seasonForm.description}
                  onChange={(ev) => setSeasonForm((f) => ({ ...f, description: ev.target.value }))}
                />
              </FormField>
            </div>
            <button type="submit" className="btn btn-primary mt-3" disabled={creatingSeason}>
              {creatingSeason ? "Saving…" : "Create season"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <i className="bx bx-error-circle fs-5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {!canManage ? (
        <p className="text-muted small mb-0">Mutations require industrial.personnel.manage.</p>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={SEASONAL_TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Seasonal sections"
        tabPanelLabel="Seasonal workspace"
      >
        {tab === "dashboard" ? (
          <div aria-label="Season metrics">
            {!seasonId ? (
              <p className="text-muted mb-0">Select or create a season to view metrics.</p>
            ) : !metrics ? (
              <p className="text-muted mb-0" role="status">
                Loading metrics…
              </p>
            ) : (
              <>
                <div className="card mb-3">
                  <div className="card-body">
                    <span className="fs-3 fw-bold">{metrics.total}</span>
                    <span className="text-muted ms-2">current engagements</span>
                  </div>
                </div>
                <div className="row g-3">
                  {(
                    [
                      ["By person status", metrics.byPersonStatus],
                      ["By hiring status", metrics.byHiringStatus],
                      ["By assignment", metrics.byAssignmentStatus],
                      ["By orientation", metrics.byOrientationStatus],
                      ["By full-time consideration", metrics.byFullTimeConsiderationStatus],
                      ["By employment type", metrics.byEmploymentType],
                    ] as const
                  ).map(([title, bag]) => (
                    <div key={title} className="col-md-6 col-lg-4">
                      <div className="card h-100">
                        <div className="card-header py-2">
                          <h6 className="card-title mb-0">{title}</h6>
                        </div>
                        <div className="card-body">
                          <ul className="list-unstyled mb-0 small">
                            {metricEntries(bag).length === 0 ? (
                              <li className="text-muted">None</li>
                            ) : (
                              metricEntries(bag).map(([k, v]) => (
                                <li key={k} className="d-flex justify-content-between gap-2 py-1">
                                  <span>{k}</span>
                                  <span className="fw-semibold">{v}</span>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === "prehire" ? (
          <div>
            {!seasonId ? (
              <p className="text-muted mb-0">Select a season before adding pre-hires.</p>
            ) : canManage ? (
              <form
                className="card"
                onSubmit={(e) => void onCreatePrehire(e)}
                aria-label="Add pre-hire seasonal worker"
              >
                <div className="card-header">
                  <h5 className="card-title mb-0">Add pre-hire seasonal worker</h5>
                </div>
                <div className="card-body">
                  <p className="text-muted">
                    Only identity and season are required. Department, position, supervisor, shift,
                    and employee number are not collected at pre-hire.
                  </p>
                  <div className="row g-3">
                    <FormField label="First name *" htmlFor="prehire-first">
                      <input
                        id="prehire-first"
                        className="form-control"
                        required
                        value={prehire.firstName}
                        onChange={(ev) => setPrehire((f) => ({ ...f, firstName: ev.target.value }))}
                      />
                    </FormField>
                    <FormField label="Last name *" htmlFor="prehire-last">
                      <input
                        id="prehire-last"
                        className="form-control"
                        required
                        value={prehire.lastName}
                        onChange={(ev) => setPrehire((f) => ({ ...f, lastName: ev.target.value }))}
                      />
                    </FormField>
                    <FormField label="Preferred name" htmlFor="prehire-preferred">
                      <input
                        id="prehire-preferred"
                        className="form-control"
                        value={prehire.preferredName}
                        onChange={(ev) =>
                          setPrehire((f) => ({ ...f, preferredName: ev.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Email" htmlFor="prehire-email">
                      <input
                        id="prehire-email"
                        type="email"
                        className="form-control"
                        value={prehire.email}
                        onChange={(ev) => setPrehire((f) => ({ ...f, email: ev.target.value }))}
                      />
                    </FormField>
                    <FormField label="Phone" htmlFor="prehire-phone">
                      <input
                        id="prehire-phone"
                        className="form-control"
                        value={prehire.phone}
                        onChange={(ev) => setPrehire((f) => ({ ...f, phone: ev.target.value }))}
                      />
                    </FormField>
                    <FormField label="Notes" htmlFor="prehire-notes" className="col-12">
                      <input
                        id="prehire-notes"
                        className="form-control"
                        value={prehire.notes}
                        onChange={(ev) => setPrehire((f) => ({ ...f, notes: ev.target.value }))}
                      />
                    </FormField>
                  </div>
                  <fieldset className="border rounded p-3 mt-3">
                    <legend className="float-none w-auto px-2 fs-6 fw-semibold text-muted">
                      Returning worker (optional)
                    </legend>
                    <div className="row g-3 align-items-end">
                      <FormField label="Search existing personnel" htmlFor="prehire-search" className="col-lg-6">
                        <input
                          id="prehire-search"
                          className="form-control"
                          value={searchQ}
                          onChange={(ev) => setSearchQ(ev.target.value)}
                          placeholder="Name, email, employee #"
                        />
                      </FormField>
                      <div className="col-lg-auto">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => void onSearchReturning()}
                        >
                          Search
                        </button>
                      </div>
                    </div>
                    {searchHits.length > 0 ? (
                      <div className="list-group mt-3">
                        {searchHits.map((hit) => (
                          <button
                            key={hit.personnelId}
                            type="button"
                            className="list-group-item list-group-item-action"
                            onClick={() =>
                              setPrehire((f) => ({
                                ...f,
                                existingPersonnelId: hit.personnelId,
                                firstName:
                                  f.firstName || String(hit.displayName ?? "").split(" ")[0] || "",
                                lastName:
                                  f.lastName ||
                                  String(hit.displayName ?? "").split(" ").slice(1).join(" ") ||
                                  "",
                              }))
                            }
                          >
                            {hit.displayName ?? hit.personnelId}
                            {hit.employeeNumber ? ` · #${hit.employeeNumber}` : ""}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <FormField label="Existing personnel ID" htmlFor="prehire-existing" className="col-12 mt-3">
                      <input
                        id="prehire-existing"
                        className="form-control"
                        value={prehire.existingPersonnelId}
                        onChange={(ev) =>
                          setPrehire((f) => ({ ...f, existingPersonnelId: ev.target.value }))
                        }
                      />
                    </FormField>
                  </fieldset>
                  <button type="submit" className="btn btn-primary mt-3" disabled={creatingPrehire}>
                    {creatingPrehire ? "Saving…" : "Add pre-hire"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-muted mb-0">Pre-hire intake requires industrial.personnel.manage.</p>
            )}
          </div>
        ) : null}

        {tab === "orientation" ? (
          <div className="d-flex flex-column gap-3">
            {canManage ? (
              <form
                className="card"
                onSubmit={(e) => void onCreateSession(e)}
                aria-label="Create orientation session"
              >
                <div className="card-header">
                  <h5 className="card-title mb-0">Create orientation session</h5>
                </div>
                <div className="card-body">
                  {templates.length === 0 ? (
                    <p className="text-muted">
                      No active orientation templates. Create templates via API before scheduling
                      sessions.
                    </p>
                  ) : null}
                  <div className="row g-3">
                    <FormField label="Template *" htmlFor="session-template">
                      <select
                        id="session-template"
                        className="form-select"
                        required
                        value={sessionForm.templateId}
                        onChange={(ev) =>
                          setSessionForm((f) => ({ ...f, templateId: ev.target.value }))
                        }
                      >
                        <option value="">Select template</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Session name *" htmlFor="session-name">
                      <input
                        id="session-name"
                        className="form-control"
                        required
                        value={sessionForm.name}
                        onChange={(ev) => setSessionForm((f) => ({ ...f, name: ev.target.value }))}
                      />
                    </FormField>
                    <FormField label="Date *" htmlFor="session-date">
                      <input
                        id="session-date"
                        type="date"
                        className="form-control"
                        required
                        value={sessionForm.sessionDate}
                        onChange={(ev) =>
                          setSessionForm((f) => ({ ...f, sessionDate: ev.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Location" htmlFor="session-location">
                      <input
                        id="session-location"
                        className="form-control"
                        value={sessionForm.location}
                        onChange={(ev) =>
                          setSessionForm((f) => ({ ...f, location: ev.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Instructor" htmlFor="session-instructor">
                      <input
                        id="session-instructor"
                        className="form-control"
                        value={sessionForm.instructorName}
                        onChange={(ev) =>
                          setSessionForm((f) => ({ ...f, instructorName: ev.target.value }))
                        }
                      />
                    </FormField>
                  </div>
                  <button type="submit" className="btn btn-primary mt-3" disabled={!sessionForm.templateId}>
                    Create session
                  </button>
                </div>
              </form>
            ) : null}

            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">Orientation sessions</h5>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Session</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                      <th scope="col">Attendees</th>
                      <th scope="col">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted">
                          No sessions for this season.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{s.sessionDate}</td>
                          <td>
                            <span className="badge bg-label-secondary">{s.status}</span>
                          </td>
                          <td>{s.attendeeCount ?? "—"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => void openSession(s.id)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {sessionDetail && selectedSessionId ? (
              <div className="card border-primary">
                <div className="card-header d-flex flex-wrap justify-content-between gap-2">
                  <div>
                    <h5 className="card-title mb-0">{sessionDetail.session.name}</h5>
                    <small className="text-muted">
                      {sessionDetail.session.sessionDate} · {sessionDetail.session.status}
                    </small>
                  </div>
                </div>
                <div className="card-body">
                  {canManage ? (
                    <div className="row g-2 align-items-end mb-3">
                      <FormField label="Add attendee (personnel ID)" htmlFor="session-attendee" className="col-lg-6">
                        <input
                          id="session-attendee"
                          className="form-control"
                          value={attendeePersonnelId}
                          onChange={(ev) => setAttendeePersonnelId(ev.target.value)}
                        />
                      </FormField>
                      <div className="col-lg-auto">
                        <button type="button" className="btn btn-outline-primary" onClick={() => void addAttendee()}>
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="list-group list-group-flush">
                    {sessionDetail.attendees.map((a) => (
                      <div
                        key={a.id}
                        className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-0"
                      >
                        <span>
                          {a.displayName ?? a.personnelId} · {a.attendanceStatus} / {a.orientationStatus}
                        </span>
                        {canManage ? (
                          <div className="d-flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => void patchAttendance(a.id, "PRESENT")}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              onClick={() => void patchAttendance(a.id, "NO_SHOW")}
                            >
                              No-show
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => void completeOrientation(a.personnelId)}
                            >
                              Complete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "workforce" ? (
          <div>
            {!seasonId ? (
              <p className="text-muted mb-0">Select a season to list workers.</p>
            ) : loadingList ? (
              <p className="text-muted mb-0" role="status">
                Loading workforce…
              </p>
            ) : (
              <div className="card">
                <div className="card-header">
                  <h5 className="card-title mb-0">Seasonal workforce</h5>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Worker</th>
                        <th scope="col">Lifecycle</th>
                        <th scope="col">Hiring</th>
                        <th scope="col">Orientation</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No seasonal workers for this season.
                          </td>
                        </tr>
                      ) : (
                        workers.map((w) => (
                          <tr
                            key={w.engagementId}
                            className={selectedId === w.personnelId ? "table-active" : undefined}
                          >
                            <td>{w.displayName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim()}</td>
                            <td>
                              <SeasonalBadge row={w} />
                            </td>
                            <td>{w.hiringStatus}</td>
                            <td>{w.orientationStatus}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => void openDetail(w.personnelId)}
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </ModuleWorkspaceTabs>

      {selectedId ? (
        <div className="card border-primary mt-3" aria-label="Worker lifecycle detail">
          <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h5 className="card-title mb-0">{displayName || "Worker"}</h5>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
          <div className="card-body">
            {detailLoading ? (
              <p className="text-muted mb-0" role="status">
                Loading lifecycle…
              </p>
            ) : lifecycle ? (
              <>
                <p className="mb-3">
                  <SeasonalBadge
                    row={{
                      personStatus: String(eng?.personStatus ?? selectedWorker?.personStatus ?? ""),
                      employmentType: String(
                        eng?.employmentType ?? selectedWorker?.employmentType ?? "",
                      ),
                    }}
                  />{" "}
                  <span className="text-muted">
                    · Hiring {String(eng?.hiringStatus ?? selectedWorker?.hiringStatus ?? "—")} ·
                    Assignment {String(eng?.assignmentStatus ?? "—")} · Orientation{" "}
                    {String(eng?.orientationStatus ?? "—")}
                  </span>
                </p>

                {canManage ? (
                  <>
                    <ActionCard title="Hiring decision">
                      <FormField label="Status" htmlFor="hiring-status">
                        <select
                          id="hiring-status"
                          className="form-select"
                          value={hiringStatus}
                          onChange={(ev) =>
                            setHiringStatus(ev.target.value as (typeof HIRING_DECISIONS)[number])
                          }
                        >
                          {HIRING_DECISIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Notes" htmlFor="hiring-notes" className="col-12">
                        <input
                          id="hiring-notes"
                          className="form-control"
                          value={hiringNotes}
                          onChange={(ev) => setHiringNotes(ev.target.value)}
                        />
                      </FormField>
                      <div className="col-12">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => void submitHiringDecision()}
                        >
                          Apply hiring decision
                        </button>
                      </div>
                    </ActionCard>

                    <ActionCard title="Activate seasonal">
                      <FormField label="Effective date *" htmlFor="activate-effective">
                        <input
                          id="activate-effective"
                          type="date"
                          className="form-control"
                          value={activateForm.effectiveDate}
                          onChange={(ev) =>
                            setActivateForm((f) => ({ ...f, effectiveDate: ev.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="Expected end" htmlFor="activate-end">
                        <input
                          id="activate-end"
                          type="date"
                          className="form-control"
                          value={activateForm.expectedEndDate}
                          onChange={(ev) =>
                            setActivateForm((f) => ({ ...f, expectedEndDate: ev.target.value }))
                          }
                        />
                      </FormField>
                      <AssignmentInputs
                        idPrefix="activate"
                        form={activateForm}
                        setForm={setActivateForm}
                      />
                      <div className="col-12">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!activateForm.effectiveDate}
                          onClick={() => setConfirm("activate")}
                        >
                          Activate seasonal…
                        </button>
                      </div>
                    </ActionCard>

                    <ActionCard title="Edit assignment">
                      <FormField label="Assignment status" htmlFor="assignment-status">
                        <select
                          id="assignment-status"
                          className="form-select"
                          value={assignmentForm.assignmentStatus}
                          onChange={(ev) =>
                            setAssignmentForm((f) => ({ ...f, assignmentStatus: ev.target.value }))
                          }
                        >
                          {["UNASSIGNED", "PARTIAL", "ASSIGNED"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <AssignmentInputs
                        idPrefix="assignment"
                        form={assignmentForm}
                        setForm={setAssignmentForm}
                      />
                      <div className="col-12">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => void saveAssignment()}
                        >
                          Save assignment
                        </button>
                      </div>
                    </ActionCard>

                    <ActionCard title="Full-time consideration">
                      <FormField label="Status" htmlFor="ft-status">
                        <select
                          id="ft-status"
                          className="form-select"
                          value={ftStatus}
                          onChange={(ev) =>
                            setFtStatus(ev.target.value as (typeof FT_STATUSES)[number])
                          }
                        >
                          {FT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Notes" htmlFor="ft-notes" className="col-12">
                        <input
                          id="ft-notes"
                          className="form-control"
                          value={ftNotes}
                          onChange={(ev) => setFtNotes(ev.target.value)}
                        />
                      </FormField>
                      <div className="col-12">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => void saveFtConsideration()}
                        >
                          Update consideration
                        </button>
                      </div>
                    </ActionCard>

                    <ActionCard title="Convert to full-time">
                      <FormField label="Effective date *" htmlFor="convert-effective">
                        <input
                          id="convert-effective"
                          type="date"
                          className="form-control"
                          value={convertForm.effectiveDate}
                          onChange={(ev) =>
                            setConvertForm((f) => ({ ...f, effectiveDate: ev.target.value }))
                          }
                        />
                      </FormField>
                      <AssignmentInputs
                        idPrefix="convert"
                        form={convertForm}
                        setForm={setConvertForm}
                      />
                      <div className="col-12">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!convertForm.effectiveDate}
                          onClick={() => setConfirm("convert")}
                        >
                          Convert to full-time…
                        </button>
                      </div>
                    </ActionCard>
                  </>
                ) : null}

                <div className="card">
                  <div className="card-header py-2">
                    <h6 className="card-title mb-0">Employment history</h6>
                  </div>
                  <div className="card-body">
                    {(history?.events ?? []).length === 0 ? (
                      <p className="text-muted mb-0">No history events yet.</p>
                    ) : (
                      <ul className="list-unstyled mb-0 small">
                        {(history?.events ?? []).map((ev) => (
                          <li key={String(ev.id)} className="py-1 border-bottom">
                            {String(ev.eventType ?? ev.action ?? "event")} ·{" "}
                            {ev.effectiveAt
                              ? new Date(String(ev.effectiveAt)).toLocaleString()
                              : "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted mb-0">Unable to load lifecycle detail.</p>
            )}
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="modal fade show d-block"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          style={{ backgroundColor: "rgba(47, 43, 61, 0.45)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="confirm-title">
                  {confirm === "activate"
                    ? "Confirm activate seasonal"
                    : confirm === "convert"
                      ? "Confirm convert to full-time"
                      : "Confirm mark not hired"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={confirmBusy}
                  onClick={() => setConfirm(null)}
                />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  {confirm === "activate"
                    ? `Activate ${displayName || "this worker"} as seasonal on ${activateForm.effectiveDate}?`
                    : confirm === "convert"
                      ? `Convert ${displayName || "this worker"} to full-time effective ${convertForm.effectiveDate}? This cannot be undone from this screen.`
                      : `Mark ${displayName || "this worker"} as NOT_HIRED?`}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={confirmBusy}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={confirmBusy}
                  onClick={() =>
                    void (confirm === "activate"
                      ? runActivate()
                      : confirm === "convert"
                        ? runConvert()
                        : runHiringDecision())
                  }
                >
                  {confirmBusy ? "Working…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
