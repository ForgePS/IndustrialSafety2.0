"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import {
  SEASONAL_LIFECYCLE_FLAG,
  isSeasonalLifecycleEnabled,
  seasonalLifecycleBadge,
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
      <section className="ind-unavailable" role="alert">
        <h1>Seasonal Workforce</h1>
        <p>You do not have permission to view personnel.</p>
        <p className="ind-muted">Missing industrial.personnel.view</p>
      </section>
    );
  }

  if (bootError) {
    return (
      <section className="ind-state" role="alert">
        <h1>Seasonal Workforce</h1>
        <p className="ind-error">{bootError}</p>
      </section>
    );
  }

  if (!bootstrap) {
    return (
      <section className="ind-state" role="status" aria-live="polite">
        <h1>Seasonal Workforce</h1>
        <p>Checking feature availability…</p>
      </section>
    );
  }

  if (!personnelModuleOn) {
    return (
      <section className="ind-unavailable" role="alert">
        <h1>Seasonal Workforce</h1>
        <p>The Personnel module is not enabled for your organization.</p>
      </section>
    );
  }

  if (!seasonalEnabled) {
    return (
      <section className="ind-seasonal ind-unavailable" role="alert">
        <h1>Seasonal Workforce</h1>
        <p>
          Seasonal pre-hire lifecycle is not enabled for this tenant. Flag{" "}
          <code>{SEASONAL_LIFECYCLE_FLAG}</code> is off.
        </p>
        {onGoToRoster ? (
          <button type="button" onClick={onGoToRoster}>
            Open standard personnel roster
          </button>
        ) : null}
      </section>
    );
  }

  const selectedWorker = workers.find((w) => w.personnelId === selectedId);
  const eng = lifecycle?.currentEngagement;
  const displayName =
    selectedWorker?.displayName ||
    (eng ? String(eng.displayName ?? "") : "") ||
    String(lifecycle?.personnel?.displayName ?? "Worker");

  return (
    <section className="ind-ops ind-seasonal" aria-labelledby="seasonal-title">
      <header className="ind-ops-header">
        <h1 id="seasonal-title">Seasonal Workforce</h1>
        <p className="ind-muted">
          Pre-hire intake, orientation, activation, and full-time conversion · Flag{" "}
          {SEASONAL_LIFECYCLE_FLAG}
        </p>
      </header>

      <div className="ind-seasonal-toolbar ind-ops-filters">
        <label>
          Season
          <select
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
        </label>
        <button type="button" onClick={() => void refreshSeasonData(seasonId)} disabled={!seasonId}>
          Refresh
        </button>
      </div>

      {canManage ? (
        <form className="ind-ops-create" onSubmit={(e) => void onCreateSeason(e)} aria-label="Create season">
          <h2>Create Season</h2>
          <label>
            Name *
            <input
              required
              value={seasonForm.name}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, name: ev.target.value }))}
            />
          </label>
          <label>
            Code *
            <input
              required
              value={seasonForm.code}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, code: ev.target.value }))}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={seasonForm.startDate}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, startDate: ev.target.value }))}
            />
          </label>
          <label>
            Expected end
            <input
              type="date"
              value={seasonForm.expectedEndDate}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, expectedEndDate: ev.target.value }))}
            />
          </label>
          <label>
            Status
            <select
              value={seasonForm.status}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, status: ev.target.value }))}
            >
              {["DRAFT", "OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              value={seasonForm.description}
              onChange={(ev) => setSeasonForm((f) => ({ ...f, description: ev.target.value }))}
            />
          </label>
          <button type="submit" disabled={creatingSeason}>
            {creatingSeason ? "Saving…" : "Create season"}
          </button>
        </form>
      ) : null}

      <div className="ind-seasonal-tabs" role="tablist" aria-label="Seasonal sections">
        {(
          [
            ["dashboard", "Dashboard"],
            ["prehire", "Pre-Hire"],
            ["orientation", "Orientation Sessions"],
            ["workforce", "Workforce"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="ind-error" role="alert">
          {error}
        </p>
      ) : null}

      {!canManage ? (
        <p className="ind-muted">Mutations require industrial.personnel.manage.</p>
      ) : null}

      {tab === "dashboard" ? (
        <div className="ind-seasonal-metrics" aria-label="Season metrics">
          {!seasonId ? (
            <p className="ind-muted">Select or create a season to view metrics.</p>
          ) : !metrics ? (
            <p role="status">Loading metrics…</p>
          ) : (
            <>
              <p>
                <strong>{metrics.total}</strong> current engagements
              </p>
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
                <div key={title} className="ind-seasonal-metric-group">
                  <h3>{title}</h3>
                  <ul>
                    {metricEntries(bag).length === 0 ? (
                      <li className="ind-muted">None</li>
                    ) : (
                      metricEntries(bag).map(([k, v]) => (
                        <li key={k}>
                          {k}: {v}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {tab === "prehire" ? (
        <div>
          {!seasonId ? (
            <p className="ind-muted">Select a season before adding pre-hires.</p>
          ) : canManage ? (
            <form
              className="ind-ops-create"
              onSubmit={(e) => void onCreatePrehire(e)}
              aria-label="Add pre-hire seasonal worker"
            >
              <h2>Add Pre-Hire Seasonal Worker</h2>
              <p className="ind-muted">
                Only identity and season are required. Department, position, supervisor, shift, and
                employee number are not collected at pre-hire.
              </p>
              <label>
                First name *
                <input
                  required
                  value={prehire.firstName}
                  onChange={(ev) => setPrehire((f) => ({ ...f, firstName: ev.target.value }))}
                />
              </label>
              <label>
                Last name *
                <input
                  required
                  value={prehire.lastName}
                  onChange={(ev) => setPrehire((f) => ({ ...f, lastName: ev.target.value }))}
                />
              </label>
              <label>
                Preferred name
                <input
                  value={prehire.preferredName}
                  onChange={(ev) => setPrehire((f) => ({ ...f, preferredName: ev.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={prehire.email}
                  onChange={(ev) => setPrehire((f) => ({ ...f, email: ev.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  value={prehire.phone}
                  onChange={(ev) => setPrehire((f) => ({ ...f, phone: ev.target.value }))}
                />
              </label>
              <label>
                Notes
                <input
                  value={prehire.notes}
                  onChange={(ev) => setPrehire((f) => ({ ...f, notes: ev.target.value }))}
                />
              </label>
              <fieldset className="ind-seasonal-fieldset">
                <legend>Returning worker (optional)</legend>
                <label>
                  Search existing personnel
                  <input
                    value={searchQ}
                    onChange={(ev) => setSearchQ(ev.target.value)}
                    placeholder="Name, email, employee #"
                  />
                </label>
                <button type="button" onClick={() => void onSearchReturning()}>
                  Search
                </button>
                {searchHits.length > 0 ? (
                  <ul className="ind-seasonal-search-hits">
                    {searchHits.map((hit) => (
                      <li key={hit.personnelId}>
                        <button
                          type="button"
                          onClick={() =>
                            setPrehire((f) => ({
                              ...f,
                              existingPersonnelId: hit.personnelId,
                              firstName: f.firstName || String(hit.displayName ?? "").split(" ")[0] || "",
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
                      </li>
                    ))}
                  </ul>
                ) : null}
                <label>
                  Existing personnel ID
                  <input
                    value={prehire.existingPersonnelId}
                    onChange={(ev) =>
                      setPrehire((f) => ({ ...f, existingPersonnelId: ev.target.value }))
                    }
                  />
                </label>
              </fieldset>
              <button type="submit" disabled={creatingPrehire}>
                {creatingPrehire ? "Saving…" : "Add pre-hire"}
              </button>
            </form>
          ) : (
            <p className="ind-muted">Pre-hire intake requires industrial.personnel.manage.</p>
          )}
        </div>
      ) : null}

      {tab === "orientation" ? (
        <div className="ind-seasonal-orientation">
          {canManage ? (
            <form
              className="ind-ops-create"
              onSubmit={(e) => void onCreateSession(e)}
              aria-label="Create orientation session"
            >
              <h2>Create orientation session</h2>
              {templates.length === 0 ? (
                <p className="ind-muted">
                  No active orientation templates. Create templates via API before scheduling
                  sessions.
                </p>
              ) : null}
              <label>
                Template *
                <select
                  required
                  value={sessionForm.templateId}
                  onChange={(ev) => setSessionForm((f) => ({ ...f, templateId: ev.target.value }))}
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session name *
                <input
                  required
                  value={sessionForm.name}
                  onChange={(ev) => setSessionForm((f) => ({ ...f, name: ev.target.value }))}
                />
              </label>
              <label>
                Date *
                <input
                  type="date"
                  required
                  value={sessionForm.sessionDate}
                  onChange={(ev) => setSessionForm((f) => ({ ...f, sessionDate: ev.target.value }))}
                />
              </label>
              <label>
                Location
                <input
                  value={sessionForm.location}
                  onChange={(ev) => setSessionForm((f) => ({ ...f, location: ev.target.value }))}
                />
              </label>
              <label>
                Instructor
                <input
                  value={sessionForm.instructorName}
                  onChange={(ev) =>
                    setSessionForm((f) => ({ ...f, instructorName: ev.target.value }))
                  }
                />
              </label>
              <button type="submit" disabled={!sessionForm.templateId}>
                Create session
              </button>
            </form>
          ) : null}

          <div className="ind-ops-table-wrap" role="region" aria-label="Orientation sessions">
            <table className="ind-ops-table">
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
                    <td colSpan={5} className="ind-muted">
                      No sessions for this season.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.sessionDate}</td>
                      <td>{s.status}</td>
                      <td>{s.attendeeCount ?? "—"}</td>
                      <td>
                        <button type="button" onClick={() => void openSession(s.id)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {sessionDetail && selectedSessionId ? (
            <div className="ind-seasonal-session-panel">
              <h3>{sessionDetail.session.name}</h3>
              <p className="ind-muted">
                {sessionDetail.session.sessionDate} · {sessionDetail.session.status}
              </p>
              {canManage ? (
                <div className="ind-seasonal-inline-form">
                  <label>
                    Add attendee (personnel ID)
                    <input
                      value={attendeePersonnelId}
                      onChange={(ev) => setAttendeePersonnelId(ev.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => void addAttendee()}>
                    Add
                  </button>
                </div>
              ) : null}
              <ul className="ind-seasonal-attendees">
                {sessionDetail.attendees.map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.displayName ?? a.personnelId} · {a.attendanceStatus} / {a.orientationStatus}
                    </span>
                    {canManage ? (
                      <span className="ind-seasonal-attendee-actions">
                        <button type="button" onClick={() => void patchAttendance(a.id, "PRESENT")}>
                          Present
                        </button>
                        <button type="button" onClick={() => void patchAttendance(a.id, "NO_SHOW")}>
                          No-show
                        </button>
                        <button type="button" onClick={() => void completeOrientation(a.personnelId)}>
                          Complete orientation
                        </button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "workforce" ? (
        <div className="ind-seasonal-workforce">
          {!seasonId ? (
            <p className="ind-muted">Select a season to list workers.</p>
          ) : loadingList ? (
            <p role="status">Loading workforce…</p>
          ) : (
            <div className="ind-ops-table-wrap" role="region" aria-label="Seasonal workforce">
              <table className="ind-ops-table">
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
                      <td colSpan={5} className="ind-muted">
                        No seasonal workers for this season.
                      </td>
                    </tr>
                  ) : (
                    workers.map((w) => {
                      const badge = seasonalLifecycleBadge(w);
                      return (
                        <tr key={w.engagementId} className={selectedId === w.personnelId ? "is-selected" : undefined}>
                          <td>{w.displayName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim()}</td>
                          <td>
                            <span className={`ind-seasonal-badge ind-seasonal-badge--${badge.kind}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td>{w.hiringStatus}</td>
                          <td>{w.orientationStatus}</td>
                          <td>
                            <button type="button" onClick={() => void openDetail(w.personnelId)}>
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {selectedId ? (
        <aside className="ind-seasonal-drawer" aria-label="Worker lifecycle detail">
          <header className="ind-seasonal-drawer-header">
            <h2>{displayName || "Worker"}</h2>
            <button type="button" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </header>
          {detailLoading ? (
            <p role="status">Loading lifecycle…</p>
          ) : lifecycle ? (
            <>
              {(() => {
                const badge = seasonalLifecycleBadge({
                  personStatus: String(eng?.personStatus ?? selectedWorker?.personStatus ?? ""),
                  employmentType: String(eng?.employmentType ?? selectedWorker?.employmentType ?? ""),
                });
                return (
                  <p>
                    <span className={`ind-seasonal-badge ind-seasonal-badge--${badge.kind}`}>
                      {badge.label}
                    </span>{" "}
                    · Hiring {String(eng?.hiringStatus ?? selectedWorker?.hiringStatus ?? "—")} ·
                    Assignment {String(eng?.assignmentStatus ?? "—")} · Orientation{" "}
                    {String(eng?.orientationStatus ?? "—")}
                  </p>
                );
              })()}

              {canManage ? (
                <>
                  <div className="ind-ops-create">
                    <h3>Hiring decision</h3>
                    <label>
                      Status
                      <select
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
                    </label>
                    <label>
                      Notes
                      <input value={hiringNotes} onChange={(ev) => setHiringNotes(ev.target.value)} />
                    </label>
                    <button type="button" onClick={() => void submitHiringDecision()}>
                      Apply hiring decision
                    </button>
                  </div>

                  <div className="ind-ops-create">
                    <h3>Activate Seasonal</h3>
                    <label>
                      Effective date *
                      <input
                        type="date"
                        value={activateForm.effectiveDate}
                        onChange={(ev) =>
                          setActivateForm((f) => ({ ...f, effectiveDate: ev.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Expected end
                      <input
                        type="date"
                        value={activateForm.expectedEndDate}
                        onChange={(ev) =>
                          setActivateForm((f) => ({ ...f, expectedEndDate: ev.target.value }))
                        }
                      />
                    </label>
                    {(
                      [
                        ["employeeNumber", "Employee number"],
                        ["facilityName", "Facility"],
                        ["departmentName", "Department"],
                        ["positionName", "Position"],
                        ["supervisorName", "Supervisor"],
                        ["shiftName", "Shift"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={activateForm[key]}
                          onChange={(ev) =>
                            setActivateForm((f) => ({ ...f, [key]: ev.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={!activateForm.effectiveDate}
                      onClick={() => setConfirm("activate")}
                    >
                      Activate seasonal…
                    </button>
                  </div>

                  <div className="ind-ops-create">
                    <h3>Edit assignment</h3>
                    <label>
                      Assignment status
                      <select
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
                    </label>
                    {(
                      [
                        ["employeeNumber", "Employee number"],
                        ["facilityName", "Facility"],
                        ["departmentName", "Department"],
                        ["positionName", "Position"],
                        ["supervisorName", "Supervisor"],
                        ["shiftName", "Shift"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={assignmentForm[key]}
                          onChange={(ev) =>
                            setAssignmentForm((f) => ({ ...f, [key]: ev.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <button type="button" onClick={() => void saveAssignment()}>
                      Save assignment
                    </button>
                  </div>

                  <div className="ind-ops-create">
                    <h3>Full-time consideration</h3>
                    <label>
                      Status
                      <select
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
                    </label>
                    <label>
                      Notes
                      <input value={ftNotes} onChange={(ev) => setFtNotes(ev.target.value)} />
                    </label>
                    <button type="button" onClick={() => void saveFtConsideration()}>
                      Update consideration
                    </button>
                  </div>

                  <div className="ind-ops-create">
                    <h3>Convert to Full-Time</h3>
                    <label>
                      Effective date *
                      <input
                        type="date"
                        value={convertForm.effectiveDate}
                        onChange={(ev) =>
                          setConvertForm((f) => ({ ...f, effectiveDate: ev.target.value }))
                        }
                      />
                    </label>
                    {(
                      [
                        ["employeeNumber", "Employee number"],
                        ["facilityName", "Facility"],
                        ["departmentName", "Department"],
                        ["positionName", "Position"],
                        ["supervisorName", "Supervisor"],
                        ["shiftName", "Shift"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={convertForm[key]}
                          onChange={(ev) =>
                            setConvertForm((f) => ({ ...f, [key]: ev.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={!convertForm.effectiveDate}
                      onClick={() => setConfirm("convert")}
                    >
                      Convert to full-time…
                    </button>
                  </div>
                </>
              ) : null}

              <div className="ind-seasonal-history">
                <h3>Employment history</h3>
                {(history?.events ?? []).length === 0 ? (
                  <p className="ind-muted">No history events yet.</p>
                ) : (
                  <ul>
                    {(history?.events ?? []).map((ev) => (
                      <li key={String(ev.id)}>
                        {String(ev.eventType ?? ev.action ?? "event")} ·{" "}
                        {ev.effectiveAt
                          ? new Date(String(ev.effectiveAt)).toLocaleString()
                          : "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="ind-muted">Unable to load lifecycle detail.</p>
          )}
        </aside>
      ) : null}

      {confirm ? (
        <div className="ind-seasonal-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="ind-seasonal-confirm-panel">
            <h2 id="confirm-title">
              {confirm === "activate"
                ? "Confirm activate seasonal"
                : confirm === "convert"
                  ? "Confirm convert to full-time"
                  : "Confirm mark not hired"}
            </h2>
            <p>
              {confirm === "activate"
                ? `Activate ${displayName || "this worker"} as seasonal on ${activateForm.effectiveDate}?`
                : confirm === "convert"
                  ? `Convert ${displayName || "this worker"} to full-time effective ${convertForm.effectiveDate}? This cannot be undone from this screen.`
                  : `Mark ${displayName || "this worker"} as NOT_HIRED?`}
            </p>
            <div className="ind-seasonal-confirm-actions">
              <button type="button" disabled={confirmBusy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
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
      ) : null}
    </section>
  );
}
