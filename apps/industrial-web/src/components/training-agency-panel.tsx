"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { trainingApi } from "@/features/training/api";
import type {
  TrainingAssignment,
  TrainingGroup,
  TrainingMaterial,
  TrainingSource,
  TrainingSourceFolder,
  TrainingTeamSummary,
} from "@/features/training/types";
import {
  matchesRosterQuery,
  rosterLocationLabel,
  sortRosterPeople,
  toRosterPeople,
  type RosterPerson,
} from "@/lib/personnel-directory";
import {
  loadOrgFilterCatalogs,
  EMPTY_ORG_FILTER_CATALOGS,
  type LookupOption,
} from "@/lib/personnel-lookups";
import type { DepartmentOption, DivisionOption } from "@/lib/personnel-assignment";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { personNameDisplay } from "@/lib/person-name-display";
import { TrainingAssignmentsHierarchy } from "@/components/training-assignments-hierarchy";
import { TrainingCourseBuilder } from "@/components/training-course-builder";
import { TrainingRecentActivityByCourse } from "@/components/training-recent-activity-by-course";
import { TrainingTeamProgressRoster } from "@/components/training-team-progress-roster";
import type { DirectoryUser } from "@/lib/user-management";

const emptyAssignmentForm = () => ({
  title: "",
  description: "",
  sourceId: "",
  materialId: "",
  dueAt: "",
  passingPercent: 70,
  quizMode: "STANDARD" as "STANDARD" | "ADAPTIVE",
  optionCount: 4,
  feedbackEnabled: true,
  timerSeconds: 0,
  assigneeEmployeeNumbers: [] as string[],
  groupIds: [] as string[],
});

export type AgencySection =
  | "dashboard"
  | "users"
  | "groups"
  | "assignments"
  | "paper"
  | "stats"
  | "records"
  | "sources"
  | "materials"
  | "study"
  | "access"
  | "qc"
  | "compliance";

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "PASSED") return "bg-label-success";
  if (normalized === "IN_PROGRESS") return "bg-label-primary";
  if (normalized === "OVERDUE") return "bg-label-danger";
  return "bg-label-secondary";
}

function employeeNumbersForGroupMembers(
  memberPersonnelIds: string[],
  roster: RosterPerson[],
): string[] {
  const byId = new Map(roster.map((person) => [person.id, person.employeeNumber.trim()]));
  return memberPersonnelIds.map((id) => byId.get(id) ?? "").filter((value) => Boolean(value));
}

function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div className="min-w-0">
        <h4 className="mb-1">{title}</h4>
        <p className="text-muted mb-0">{description}</p>
      </div>
      {actions ? <div className="d-flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "primary",
  icon,
  onClick,
  selected = false,
}: {
  label: string;
  value: string | number;
  tone?: string;
  icon: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const body = (
    <div className="card-body d-flex align-items-center gap-3">
      <span className={`avatar avatar-md rounded bg-label-${tone}`}>
        <i className={`bx ${icon} bx-sm`} aria-hidden />
      </span>
      <div>
        <div className="fs-4 fw-bold lh-1">{value}</div>
        <div className="text-muted small">{label}</div>
      </div>
    </div>
  );
  if (!onClick) {
    return <div className="card h-100">{body}</div>;
  }
  return (
    <button
      type="button"
      className={`card h-100 w-100 text-start border ${selected ? "border-primary shadow-sm" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {body}
    </button>
  );
}

type DashboardStatusFilter = "active" | "completed" | "in_progress" | "overdue";

function isRosterOverdue(row: TrainingTeamSummary["roster"][number], now = Date.now()): boolean {
  if (String(row.status ?? "").toUpperCase() === "PASSED") return false;
  if (!row.dueAt) return false;
  const due = new Date(row.dueAt).getTime();
  return Number.isFinite(due) && due < now;
}

function matchesDashboardStatusFilter(
  row: TrainingTeamSummary["roster"][number],
  filter: DashboardStatusFilter,
  now = Date.now(),
): boolean {
  const status = String(row.status ?? "").toUpperCase();
  if (filter === "completed") return status === "PASSED";
  if (filter === "in_progress") return status === "IN_PROGRESS";
  if (filter === "overdue") return isRosterOverdue(row, now);
  // Active = still open work (not completed)
  return status !== "PASSED";
}

function formatDashboardDue(dueAt?: string | null) {
  if (!dueAt) return "—";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dashboardStatusBadge(row: TrainingTeamSummary["roster"][number]) {
  if (isRosterOverdue(row)) return { label: "Overdue", className: "bg-label-danger" };
  const status = String(row.status ?? "").toUpperCase() || "UNKNOWN";
  if (status === "PASSED") return { label: "Completed", className: "bg-label-success" };
  if (status === "IN_PROGRESS") return { label: "In progress", className: "bg-label-primary" };
  if (status === "NOT_STARTED") return { label: "Not started", className: "bg-label-secondary" };
  return {
    label: status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase()),
    className: "bg-label-secondary",
  };
}

type Props = {
  section: AgencySection;
  canManage: boolean;
  canPurgeCourses: boolean;
  users: DirectoryUser[];
  sources: TrainingSource[];
  materials: TrainingMaterial[];
  progress: {
    stats: Array<Record<string, unknown>>;
    recentAttempts: Array<Record<string, unknown>>;
  } | null;
  query: string;
  onQuery: (value: string) => void;
  onOpenStudy: () => void;
  onOpenStudyAuthor: (sourceId?: string) => void;
  onRefreshSources: () => Promise<void>;
  onRefreshMaterials: () => Promise<void>;
  onError: (message: string | null) => void;
};

export function TrainingAgencyPanel({
  section,
  canManage,
  canPurgeCourses,
  users: _users,
  sources,
  materials,
  progress,
  query,
  onQuery,
  onOpenStudy,
  onOpenStudyAuthor,
  onRefreshSources,
  onRefreshMaterials,
  onError,
}: Props) {
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [teamSummary, setTeamSummary] = useState<TrainingTeamSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [qrAssignmentId, setQrAssignmentId] = useState<string | null>(null);
  const [personnelRoster, setPersonnelRoster] = useState<RosterPerson[]>([]);
  const [personnelSites, setPersonnelSites] = useState<LookupOption[]>([]);
  const [personnelDepartments, setPersonnelDepartments] = useState<LookupOption[]>([]);
  const [personnelDivisionEntries, setPersonnelDivisionEntries] = useState<DivisionOption[]>([]);
  const [bulkAssign, setBulkAssign] = useState({
    siteId: "",
    divisionName: "",
    departmentId: "",
    jobTitle: "",
    companyWide: false,
  });
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    memberPersonnelIds: [] as string[],
  });
  const [groupEditForm, setGroupEditForm] = useState<{
    name: string;
    description: string;
    memberPersonnelIds: string[];
  } | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceForm, setSourceForm] = useState({
    title: "",
    edition: "",
    description: "",
    groupIds: [] as string[],
  });
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceEditForm, setSourceEditForm] = useState({
    title: "",
    edition: "",
    description: "",
    groupIds: [] as string[],
  });
  const [courseGroupFilter, setCourseGroupFilter] = useState("");
  const [courseListMode, setCourseListMode] = useState<"active" | "archived">("active");
  const [archivedSources, setArchivedSources] = useState<TrainingSource[]>([]);
  const [foldersBySource, setFoldersBySource] = useState<Record<string, TrainingSourceFolder[]>>(
    {},
  );
  const [paperSourceId, setPaperSourceId] = useState("");
  const [paperAssignees, setPaperAssignees] = useState<string[]>([]);
  const [paperScoreMode, setPaperScoreMode] = useState<"shared" | "per">("shared");
  const [paperSharedPercent, setPaperSharedPercent] = useState(100);
  const [paperPercents, setPaperPercents] = useState<Record<string, string>>({});
  const [paperCompletedAt, setPaperCompletedAt] = useState("");
  const [paperPassingPercent, setPaperPassingPercent] = useState(70);
  const [paperPostSummary, setPaperPostSummary] = useState<{
    sourceTitle: string;
    posted: Array<{ employeeNumber: string; percent: number; status: string; passed: boolean }>;
  } | null>(null);
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<DashboardStatusFilter | null>(
    null,
  );

  const publishedSources = useMemo(
    () => sources.filter((s) => s.status === "PUBLISHED"),
    [sources],
  );

  const refreshAgency = useCallback(async () => {
    setBusy(true);
    onError(null);
    try {
      const [groupRows, assignmentRows, summary, personnelRows, orgCatalogs] = await Promise.all([
        trainingApi.listGroups().catch(() => [] as TrainingGroup[]),
        trainingApi.listAssignments().catch(() => ({ items: [] as TrainingAssignment[] })),
        canManage ? trainingApi.teamSummary().catch(() => null) : Promise.resolve(null),
        trainingApi
          .listPersonnelRoster()
          .catch(() => ({ items: [] as Array<Record<string, unknown>> })),
        loadOrgFilterCatalogs().catch(() => EMPTY_ORG_FILTER_CATALOGS),
      ]);
      setGroups(groupRows ?? []);
      setAssignments(assignmentRows.items ?? []);
      setTeamSummary(summary);
      setPersonnelRoster(
        sortRosterPeople(
          toRosterPeople(personnelRows.items ?? []).filter((person) =>
            person.employeeNumber.trim(),
          ),
          "firstName",
        ),
      );
      setPersonnelSites(orgCatalogs.sites);
      setPersonnelDepartments(orgCatalogs.departments);
      setPersonnelDivisionEntries(orgCatalogs.divisionEntries);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Failed to load training admin data");
    } finally {
      setBusy(false);
    }
  }, [canManage, onError]);

  useEffect(() => {
    if (
      section === "dashboard" ||
      section === "groups" ||
      section === "assignments" ||
      section === "paper" ||
      section === "stats" ||
      section === "sources"
    ) {
      void refreshAgency();
    }
  }, [section, refreshAgency]);

  const refreshSourceFolders = useCallback(async () => {
    if (section !== "sources" || !sources.length) {
      setFoldersBySource({});
      return;
    }
    const entries = await Promise.all(
      sources.map(async (source) => {
        try {
          const rows = await trainingApi.listSourceFolders(source.id);
          return [source.id, rows ?? []] as const;
        } catch {
          return [source.id, []] as const;
        }
      }),
    );
    setFoldersBySource(Object.fromEntries(entries));
  }, [section, sources]);

  useEffect(() => {
    if (section === "sources") {
      void refreshSourceFolders();
    }
  }, [section, refreshSourceFolders]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !groupForm.name.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await trainingApi.createGroup({
        name: groupForm.name.trim(),
        ...(groupForm.description.trim() ? { description: groupForm.description.trim() } : {}),
        memberPersonnelIds: groupForm.memberPersonnelIds,
      });
      setGroupForm({ name: "", description: "", memberPersonnelIds: [] });
      setShowGroupForm(false);
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  }

  function openEditAssignment(assignment: TrainingAssignment) {
    setEditingAssignmentId(assignment.id);
    setShowAssignmentForm(true);
    setAssignmentForm({
      title: assignment.title,
      description: assignment.description ?? "",
      sourceId: assignment.sourceId,
      materialId: assignment.materialId ?? "",
      dueAt: assignment.dueAt ? String(assignment.dueAt).slice(0, 10) : "",
      passingPercent: assignment.passingPercent,
      quizMode: assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD",
      optionCount: assignment.optionCount || 4,
      feedbackEnabled: assignment.feedbackEnabled !== false,
      timerSeconds: assignment.timerSeconds ?? 0,
      assigneeEmployeeNumbers: (assignment.assignees ?? [])
        .map((a) => a.employeeNumber?.trim())
        .filter((n): n is string => Boolean(n)),
      groupIds: [],
    });
  }

  function closeAssignmentForm() {
    setShowAssignmentForm(false);
    setEditingAssignmentId(null);
    setAssignmentForm(emptyAssignmentForm());
  }

  async function saveAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    if (!assignmentForm.title.trim() || !assignmentForm.sourceId) {
      onError("Title and course are required.");
      return;
    }
    if (!assignmentForm.assigneeEmployeeNumbers.length && !assignmentForm.groupIds.length) {
      onError("Select at least one EMPLOYEE number from the roster or a group.");
      return;
    }
    setBusy(true);
    onError(null);
    const payload = {
      title: assignmentForm.title.trim(),
      ...(assignmentForm.description.trim()
        ? { description: assignmentForm.description.trim() }
        : {}),
      sourceId: assignmentForm.sourceId,
      ...(assignmentForm.materialId
        ? { materialId: assignmentForm.materialId }
        : { materialId: null }),
      ...(assignmentForm.dueAt
        ? { dueAt: new Date(assignmentForm.dueAt).toISOString() }
        : { dueAt: null }),
      passingPercent: assignmentForm.passingPercent,
      quizMode: assignmentForm.quizMode,
      optionCount: assignmentForm.optionCount,
      feedbackEnabled: assignmentForm.feedbackEnabled,
      timerSeconds: assignmentForm.timerSeconds > 0 ? assignmentForm.timerSeconds : null,
      assigneeEmployeeNumbers: assignmentForm.assigneeEmployeeNumbers,
      groupIds: assignmentForm.groupIds,
    };
    try {
      if (editingAssignmentId) {
        const { groupIds: _groups, ...updatePayload } = payload;
        await trainingApi.updateAssignment(editingAssignmentId, updatePayload);
      } else {
        await trainingApi.createAssignment(payload);
      }
      closeAssignmentForm();
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not save assignment");
    } finally {
      setBusy(false);
    }
  }

  async function saveGroupEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !editingGroupId || !groupEditForm) return;
    if (!groupEditForm.name.trim()) {
      onError("Group name is required.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.updateGroup(editingGroupId, {
        name: groupEditForm.name.trim(),
        description: groupEditForm.description.trim() || null,
        memberPersonnelIds: groupEditForm.memberPersonnelIds,
      });
      setEditingGroupId(null);
      setGroupEditForm(null);
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not update group");
    } finally {
      setBusy(false);
    }
  }

  function openGroupEditor(group: TrainingGroup) {
    setEditingGroupId(group.id);
    setGroupEditForm({
      name: group.name,
      description: group.description ?? "",
      memberPersonnelIds: [...(group.memberPersonnelIds ?? [])],
    });
  }

  function closeGroupEditor() {
    setEditingGroupId(null);
    setGroupEditForm(null);
  }

  async function deleteGroup(group: TrainingGroup) {
    if (!canManage) return;
    if (!window.confirm(`Delete group “${group.name}”? This cannot be undone.`)) return;
    setBusy(true);
    onError(null);
    try {
      await trainingApi.archiveGroup(group.id);
      if (editingGroupId === group.id) closeGroupEditor();
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not delete group");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(assignment: TrainingAssignment) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Delete “${assignment.title}”? This removes the assignment for all assignees and cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.archiveAssignment(assignment.id);
      if (editingAssignmentId === assignment.id) closeAssignmentForm();
      if (qrAssignmentId === assignment.id) setQrAssignmentId(null);
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not delete assignment");
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignmentAssignee(
    assignment: TrainingAssignment,
    assigneeId: string,
    label: string,
  ) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Remove ${label} from “${assignment.title}”? Their progress on this assignment will be deleted.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.removeAssignmentAssignee(assignment.id, assigneeId);
      await refreshAgency();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not remove assignee");
    } finally {
      setBusy(false);
    }
  }

  function closeSourceForm() {
    setShowSourceForm(false);
    setSourceForm({ title: "", edition: "", description: "", groupIds: [] });
  }

  function openEditSource(source: TrainingSource) {
    closeSourceForm();
    setEditingSourceId(source.id);
    setSourceEditForm({
      title: source.title,
      edition: source.edition ?? "",
      description: source.description ?? "",
      groupIds: source.groupIds ?? [],
    });
  }

  function closeEditSource() {
    setEditingSourceId(null);
    setSourceEditForm({ title: "", edition: "", description: "", groupIds: [] });
  }

  async function setSourceStatus(source: TrainingSource, status: "DRAFT" | "PUBLISHED") {
    if (!canManage) return;
    setBusy(true);
    onError(null);
    try {
      await trainingApi.updateSource(source.id, { status });
      await onRefreshSources();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not update course status");
    } finally {
      setBusy(false);
    }
  }

  const refreshArchivedSources = useCallback(async () => {
    if (!canManage) {
      setArchivedSources([]);
      return;
    }
    try {
      const data = await trainingApi.listSources({ archived: "true" });
      setArchivedSources(data.items ?? []);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not load archived courses");
    }
  }, [canManage, onError]);

  useEffect(() => {
    if (section !== "sources" || courseListMode !== "archived" || !canManage) return;
    void refreshArchivedSources();
  }, [section, courseListMode, canManage, refreshArchivedSources]);

  async function archiveSource(source: TrainingSource) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Archive “${source.title}”? Open assignments for this course will be closed. Materials stay linked so you can reactivate the course later.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.archiveSource(source.id);
      if (editingSourceId === source.id) closeEditSource();
      await Promise.all([onRefreshSources(), onRefreshMaterials()]);
      if (courseListMode === "archived") await refreshArchivedSources();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not archive course");
    } finally {
      setBusy(false);
    }
  }

  async function reactivateSource(source: TrainingSource) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Reactivate “${source.title}”? It will return as a draft so you can review and publish when ready.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.restoreSource(source.id);
      await Promise.all([onRefreshSources(), refreshArchivedSources()]);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not reactivate course");
    } finally {
      setBusy(false);
    }
  }

  async function purgeSource(source: TrainingSource) {
    if (!canPurgeCourses) return;
    if (
      !window.confirm(
        `Permanently delete “${source.title}”? This removes the course, its quiz questions, and related assignment history. Materials stay in the library but are unlinked. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await trainingApi.purgeSource(source.id);
      await Promise.all([onRefreshSources(), onRefreshMaterials(), refreshArchivedSources()]);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not delete course");
    } finally {
      setBusy(false);
    }
  }

  const materialsBySource = useMemo(() => {
    const map = new Map<string, TrainingMaterial[]>();
    for (const material of materials) {
      if (material.status === "ARCHIVED") continue;
      const sourceId = material.sourceId?.trim();
      if (!sourceId) continue;
      const list = map.get(sourceId) ?? [];
      list.push(material);
      map.set(sourceId, list);
    }
    return map;
  }, [materials]);

  const unlinkedMaterials = useMemo(
    () => materials.filter((m) => m.status === "ACTIVE" && !m.sourceId?.trim()),
    [materials],
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const linkedMaterials = materials.filter((m) => m.sourceId && m.status === "ACTIVE");

  if (section === "dashboard") {
    const totals = teamSummary?.totals;
    const roster = teamSummary?.roster ?? [];
    const filteredRoster = dashboardStatusFilter
      ? roster
          .filter((row) => matchesDashboardStatusFilter(row, dashboardStatusFilter))
          .slice()
          .sort((a, b) => {
            const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
            const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
            if (aDue !== bDue) return aDue - bDue;
            return a.userLabel.localeCompare(b.userLabel);
          })
      : [];
    const filterTitle =
      dashboardStatusFilter === "active"
        ? "Active assignments"
        : dashboardStatusFilter === "completed"
          ? "Completed"
          : dashboardStatusFilter === "in_progress"
            ? "In progress"
            : dashboardStatusFilter === "overdue"
              ? "Overdue"
              : null;

    function toggleDashboardFilter(next: DashboardStatusFilter) {
      setDashboardStatusFilter((current) => (current === next ? null : next));
    }

    return (
      <>
        <SectionHeader
          title="Training dashboard"
          description="Facility-wide assignments, completion rates, and study activity. Click a status card to see who it applies to."
          actions={
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => void refreshAgency()}
            >
              Refresh
            </button>
          }
        />
        {busy ? <p className="text-muted small">Refreshing…</p> : null}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <StatCard
              label="Active assignments"
              value={totals?.assignments ?? assignments.length}
              icon="bx-send"
              selected={dashboardStatusFilter === "active"}
              onClick={() => toggleDashboardFilter("active")}
            />
          </div>
          <div className="col-6 col-md-3">
            <StatCard
              label="Completed"
              value={totals?.completed ?? 0}
              icon="bx-check-circle"
              tone="success"
              selected={dashboardStatusFilter === "completed"}
              onClick={() => toggleDashboardFilter("completed")}
            />
          </div>
          <div className="col-6 col-md-3">
            <StatCard
              label="In progress"
              value={totals?.inProgress ?? 0}
              icon="bx-loader-circle"
              tone="primary"
              selected={dashboardStatusFilter === "in_progress"}
              onClick={() => toggleDashboardFilter("in_progress")}
            />
          </div>
          <div className="col-6 col-md-3">
            <StatCard
              label="Overdue"
              value={totals?.overdue ?? 0}
              icon="bx-error"
              tone="danger"
              selected={dashboardStatusFilter === "overdue"}
              onClick={() => toggleDashboardFilter("overdue")}
            />
          </div>
        </div>
        {dashboardStatusFilter && filterTitle ? (
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h5 className="mb-0">{filterTitle}</h5>
                  <p className="text-muted small mb-0">
                    {filteredRoster.length} employee assignment
                    {filteredRoster.length === 1 ? "" : "s"}
                    {dashboardStatusFilter === "active"
                      ? " still open (assignment card count is unique assignments)."
                      : "."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setDashboardStatusFilter(null)}
                >
                  Clear filter
                </button>
              </div>
              {filteredRoster.length ? (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Emp #</th>
                        <th>Assignment</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th>Due</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoster.map((row) => {
                        const badge = dashboardStatusBadge(row);
                        return (
                          <tr key={row.assigneeId}>
                            <td>{personNameDisplay(row.userLabel)}</td>
                            <td>{row.employeeNumber?.trim() || "—"}</td>
                            <td>{row.assignmentTitle}</td>
                            <td>{row.sourceTitle}</td>
                            <td>
                              <span className={`badge ${badge.className}`}>{badge.label}</span>
                            </td>
                            <td>{formatDashboardDue(row.dueAt)}</td>
                            <td>{row.bestPercent != null ? `${row.bestPercent}%` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted mb-0">No matching employee assignments for this status.</p>
              )}
            </div>
          </div>
        ) : null}
        <div className="row g-3 mb-4">
          <div className="col-md-4">
            <StatCard
              label="Published courses"
              value={publishedSources.length}
              icon="bx-book-content"
              tone="info"
            />
          </div>
          <div className="col-md-4">
            <StatCard label="Training groups" value={groups.length} icon="bx-collection" />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Recent quiz attempts"
              value={(progress?.recentAttempts ?? []).length}
              icon="bx-bar-chart"
              tone="warning"
            />
          </div>
        </div>
        <h5 className="mb-2">Recent team activity</h5>
        <p className="text-muted small mb-3">Select a course to view recent learner activity.</p>
        <TrainingRecentActivityByCourse roster={teamSummary?.roster ?? []} />
      </>
    );
  }

  if (section === "groups") {
    return (
      <>
        <SectionHeader
          title="Groups"
          description="Organize learners into shifts, classes, or teams. Assignments sent to a group reach every MEMBER."
          actions={
            canManage ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowGroupForm((v) => !v)}
              >
                {showGroupForm ? "Cancel" : "New group"}
              </button>
            ) : null
          }
        />
        {showGroupForm && canManage ? (
          <form className="card border mb-4" onSubmit={(e) => void createGroup(e)}>
            <div className="card-body">
              <h6 className="mb-3">Create group</h6>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="group-name">
                    Name
                  </label>
                  <input
                    id="group-name"
                    className="form-control"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="group-desc">
                    Description
                  </label>
                  <input
                    id="group-desc"
                    className="form-control"
                    value={groupForm.description}
                    onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div className="col-12">
                  <PersonnelGroupMemberPicker
                    people={personnelRoster}
                    sites={personnelSites}
                    departments={personnelDepartments}
                    divisionEntries={personnelDivisionEntries}
                    selected={groupForm.memberPersonnelIds}
                    onChange={(ids) => setGroupForm((p) => ({ ...p, memberPersonnelIds: ids }))}
                  />
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Save group
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : null}
        <input
          className="form-control mb-3"
          style={{ maxWidth: "22rem" }}
          placeholder="Search groups…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search groups"
        />
        <ul className="list-group">
          {filteredGroups.map((g) => {
            const memberEmployeeNumbers = employeeNumbersForGroupMembers(
              g.memberPersonnelIds ?? [],
              personnelRoster,
            );
            const editing = editingGroupId === g.id;
            return (
              <li key={g.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                  <div>
                    <div className="fw-semibold">{g.name}</div>
                    {g.description ? <div className="text-muted small">{g.description}</div> : null}
                    <div className="text-muted small">
                      {g.memberCount} employee{g.memberCount === 1 ? "" : "s"}
                      {memberEmployeeNumbers.length
                        ? ` · ${memberEmployeeNumbers.slice(0, 4).join(", ")}${
                            memberEmployeeNumbers.length > 4 ? "…" : ""
                          }`
                        : ""}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => (editing ? closeGroupEditor() : openGroupEditor(g))}
                      >
                        {editing ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => void deleteGroup(g)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
                {editing && groupEditForm ? (
                  <form className="border rounded p-3 mt-3" onSubmit={(e) => void saveGroupEdit(e)}>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label" htmlFor={`edit-group-name-${g.id}`}>
                          Name
                        </label>
                        <input
                          id={`edit-group-name-${g.id}`}
                          className="form-control"
                          value={groupEditForm.name}
                          onChange={(e) =>
                            setGroupEditForm((current) =>
                              current ? { ...current, name: e.target.value } : current,
                            )
                          }
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" htmlFor={`edit-group-desc-${g.id}`}>
                          Description
                        </label>
                        <input
                          id={`edit-group-desc-${g.id}`}
                          className="form-control"
                          value={groupEditForm.description}
                          onChange={(e) =>
                            setGroupEditForm((current) =>
                              current ? { ...current, description: e.target.value } : current,
                            )
                          }
                        />
                      </div>
                      <div className="col-12">
                        <PersonnelGroupMemberPicker
                          people={personnelRoster}
                          sites={personnelSites}
                          departments={personnelDepartments}
                          divisionEntries={personnelDivisionEntries}
                          selected={groupEditForm.memberPersonnelIds}
                          onChange={(ids) =>
                            setGroupEditForm((current) =>
                              current ? { ...current, memberPersonnelIds: ids } : current,
                            )
                          }
                        />
                      </div>
                      <div className="col-12 d-flex gap-2">
                        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={closeGroupEditor}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
          {!filteredGroups.length ? (
            <li className="list-group-item text-muted">No groups yet.</li>
          ) : null}
        </ul>
      </>
    );
  }

  if (section === "assignments") {
    return (
      <>
        <SectionHeader
          title="Assignments"
          description="Send quizzes to individuals or groups. Track completion and scores across your facility."
          actions={
            canManage ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  showAssignmentForm ? closeAssignmentForm() : setShowAssignmentForm(true)
                }
              >
                {showAssignmentForm ? "Cancel" : "New assignment"}
              </button>
            ) : null
          }
        />
        {showAssignmentForm && canManage ? (
          <form className="card border mb-4" onSubmit={(e) => void saveAssignment(e)}>
            <div className="card-body">
              <h6 className="mb-3">
                {editingAssignmentId ? "Edit assignment" : "Create assignment"}
              </h6>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="assign-title">
                    Title
                  </label>
                  <input
                    id="assign-title"
                    className="form-control"
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm((p) => ({ ...p, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="assign-due">
                    Due date
                  </label>
                  <input
                    id="assign-due"
                    type="date"
                    className="form-control"
                    value={assignmentForm.dueAt}
                    onChange={(e) => setAssignmentForm((p) => ({ ...p, dueAt: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="assign-source">
                    Course
                  </label>
                  <select
                    id="assign-source"
                    className="form-select"
                    value={assignmentForm.sourceId}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({ ...p, sourceId: e.target.value, materialId: "" }))
                    }
                    required
                  >
                    <option value="">Select course…</option>
                    {publishedSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.edition ? ` (${s.edition})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="assign-material">
                    Linked material (optional)
                  </label>
                  <select
                    id="assign-material"
                    className="form-select"
                    value={assignmentForm.materialId}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({ ...p, materialId: e.target.value }))
                    }
                    disabled={!assignmentForm.sourceId}
                  >
                    <option value="">None</option>
                    {linkedMaterials
                      .filter((m) => m.sourceId === assignmentForm.sourceId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="assign-pass">
                    Passing %
                  </label>
                  <input
                    id="assign-pass"
                    type="number"
                    min={1}
                    max={100}
                    className="form-control"
                    value={assignmentForm.passingPercent}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({
                        ...p,
                        passingPercent: Number(e.target.value) || 70,
                      }))
                    }
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="assign-mode">
                    Quiz mode
                  </label>
                  <select
                    id="assign-mode"
                    className="form-select"
                    value={assignmentForm.quizMode}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({
                        ...p,
                        quizMode: e.target.value === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD",
                      }))
                    }
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="ADAPTIVE">Adaptive</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="assign-timer">
                    Timer (seconds)
                  </label>
                  <input
                    id="assign-timer"
                    type="number"
                    min={0}
                    className="form-control"
                    value={assignmentForm.timerSeconds}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({
                        ...p,
                        timerSeconds: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <div className="form-check mb-2">
                    <input
                      id="assign-feedback"
                      type="checkbox"
                      className="form-check-input"
                      checked={assignmentForm.feedbackEnabled}
                      onChange={(e) =>
                        setAssignmentForm((p) => ({ ...p, feedbackEnabled: e.target.checked }))
                      }
                    />
                    <label className="form-check-label" htmlFor="assign-feedback">
                      Show feedback
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-label">Assign to personnel</div>
                  <PersonnelCheckboxList
                    people={personnelRoster}
                    sites={personnelSites}
                    departments={personnelDepartments}
                    divisionEntries={personnelDivisionEntries}
                    valueKey="employeeNumber"
                    selected={assignmentForm.assigneeEmployeeNumbers}
                    onChange={(ids) =>
                      setAssignmentForm((p) => ({ ...p, assigneeEmployeeNumbers: ids }))
                    }
                  />
                </div>
                <div className="col-md-6">
                  <div className="form-label">Assign to groups</div>
                  <div className="training-checkbox-panel">
                    {groups.map((g) => {
                      const checked = assignmentForm.groupIds.includes(g.id);
                      return (
                        <div key={g.id} className="form-check">
                          <input
                            id={`assign-gr-${g.id}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={checked}
                            onChange={() =>
                              setAssignmentForm((p) => ({
                                ...p,
                                groupIds: checked
                                  ? p.groupIds.filter((id) => id !== g.id)
                                  : [...p.groupIds, g.id],
                              }))
                            }
                          />
                          <label className="form-check-label" htmlFor={`assign-gr-${g.id}`}>
                            {g.name} ({g.memberCount})
                          </label>
                        </div>
                      );
                    })}
                    {!groups.length ? (
                      <p className="text-muted small mb-0">
                        Create groups first to assign by cohort.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="assign-desc">
                    Description
                  </label>
                  <textarea
                    id="assign-desc"
                    className="form-control"
                    rows={2}
                    value={assignmentForm.description}
                    onChange={(e) =>
                      setAssignmentForm((p) => ({ ...p, description: e.target.value }))
                    }
                  />
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? "Saving…" : editingAssignmentId ? "Save changes" : "Create assignment"}
                  </button>
                </div>
                {editingAssignmentId && canManage ? (
                  <div className="col-12">
                    <div className="border rounded p-3 bg-light">
                      <h6 className="mb-2">Bulk assign by rule</h6>
                      <p className="small text-muted mb-3">
                        Add all matching active personnel to this assignment without picking them
                        one by one.
                      </p>
                      <div className="row g-2 align-items-end">
                        <OrgLocationCascade
                          idPrefix="bulk-assign"
                          size="sm"
                          colClass="col-md-3"
                          locationEmptyLabel="Any location"
                          disabled={bulkAssign.companyWide}
                          sites={personnelSites}
                          departments={personnelDepartments as DepartmentOption[]}
                          divisionEntries={personnelDivisionEntries}
                          value={{
                            siteId: bulkAssign.siteId,
                            siteName:
                              personnelSites.find((s) => s.id === bulkAssign.siteId)?.label ?? "",
                            divisionName: bulkAssign.divisionName,
                            departmentId: bulkAssign.departmentId,
                            departmentName:
                              personnelDepartments.find((d) => d.id === bulkAssign.departmentId)
                                ?.label ?? "",
                          }}
                          onChange={(next) =>
                            setBulkAssign((p) => ({
                              ...p,
                              siteId: next.siteId,
                              divisionName: next.divisionName,
                              departmentId: next.departmentId,
                            }))
                          }
                        />
                        <div className="col-md-3">
                          <label className="form-label small" htmlFor="bulk-job">
                            Job title
                          </label>
                          <input
                            id="bulk-job"
                            className="form-control form-control-sm"
                            value={bulkAssign.jobTitle}
                            disabled={bulkAssign.companyWide}
                            onChange={(e) =>
                              setBulkAssign((p) => ({ ...p, jobTitle: e.target.value }))
                            }
                            placeholder="Exact title match"
                          />
                        </div>
                        <div className="col-md-3">
                          <div className="form-check mb-2">
                            <input
                              id="bulk-company"
                              type="checkbox"
                              className="form-check-input"
                              checked={bulkAssign.companyWide}
                              onChange={(e) =>
                                setBulkAssign((p) => ({
                                  ...p,
                                  companyWide: e.target.checked,
                                }))
                              }
                            />
                            <label className="form-check-label" htmlFor="bulk-company">
                              Company-wide
                            </label>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                if (!editingAssignmentId) return;
                                if (
                                  !bulkAssign.companyWide &&
                                  !bulkAssign.siteId &&
                                  !bulkAssign.departmentId &&
                                  !bulkAssign.jobTitle.trim()
                                ) {
                                  onError(
                                    "Choose a location, department, job title, or company-wide.",
                                  );
                                  return;
                                }
                                setBusy(true);
                                onError(null);
                                try {
                                  const result = await trainingApi.bulkAssign(editingAssignmentId, {
                                    ...(bulkAssign.companyWide
                                      ? { companyWide: true }
                                      : {
                                          ...(bulkAssign.siteId
                                            ? { siteId: bulkAssign.siteId }
                                            : {}),
                                          ...(bulkAssign.departmentId
                                            ? { departmentId: bulkAssign.departmentId }
                                            : {}),
                                          ...(bulkAssign.jobTitle.trim()
                                            ? { jobTitle: bulkAssign.jobTitle.trim() }
                                            : {}),
                                        }),
                                  });
                                  await refreshAgency();
                                  onError(null);
                                  window.alert(`Added ${result.added} assignee(s).`);
                                } catch (e) {
                                  onError(e instanceof ApiError ? e.message : "Bulk assign failed");
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            Run bulk assign
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        ) : null}
        <TrainingAssignmentsHierarchy
          assignments={assignments}
          roster={teamSummary?.roster ?? []}
          groups={groups}
          personnelRoster={personnelRoster}
          canManage={canManage}
          qrAssignmentId={qrAssignmentId}
          onQrToggle={setQrAssignmentId}
          onEdit={openEditAssignment}
          onDelete={(assignment) => void deleteAssignment(assignment)}
          onRemoveAssignee={(assignment, assigneeId, label) =>
            void removeAssignmentAssignee(assignment, assigneeId, label)
          }
        />
      </>
    );
  }

  if (section === "paper") {
    async function downloadPaper(variant: "trainee" | "key") {
      if (!paperSourceId) {
        onError("Select a course first.");
        return;
      }
      setBusy(true);
      onError(null);
      try {
        await trainingApi.downloadPaperQuiz(paperSourceId, variant);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Could not open paper quiz");
      } finally {
        setBusy(false);
      }
    }

    async function postPaperResults(e: React.FormEvent) {
      e.preventDefault();
      if (!canManage || !paperSourceId) {
        onError("Select a published course.");
        return;
      }
      if (!paperAssignees.length) {
        onError("Select at least one trainee.");
        return;
      }

      const results = paperAssignees.map((employeeNumber) => {
        const percent =
          paperScoreMode === "shared"
            ? paperSharedPercent
            : Math.round(Number(paperPercents[employeeNumber] ?? ""));
        return {
          employeeNumber,
          percent,
          ...(paperCompletedAt ? { completedAt: paperCompletedAt } : {}),
        };
      });

      for (const row of results) {
        if (!Number.isFinite(row.percent) || row.percent < 0 || row.percent > 100) {
          onError(`Enter a percent from 0-100 for employee ${row.employeeNumber}.`);
          return;
        }
      }

      setBusy(true);
      onError(null);
      try {
        const posted = await trainingApi.postPaperResults(paperSourceId, {
          passingPercent: paperPassingPercent,
          results,
        });
        setPaperPostSummary({
          sourceTitle: posted.sourceTitle,
          posted: posted.posted,
        });
        setPaperAssignees([]);
        setPaperPercents({});
        await refreshAgency();
      } catch (err) {
        onError(err instanceof ApiError ? err.message : "Could not post paper quiz results");
      } finally {
        setBusy(false);
      }
    }

    return (
      <>
        <SectionHeader
          title="Paper quiz"
          description="Download a printable quiz for a course, then bulk-select trainees and post their scores."
        />

        <div className="card border mb-4">
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <label className="form-label" htmlFor="paper-course">
                  Course
                </label>
                <select
                  id="paper-course"
                  className="form-select"
                  value={paperSourceId}
                  onChange={(e) => {
                    setPaperSourceId(e.target.value);
                    setPaperPostSummary(null);
                  }}
                >
                  <option value="">Select course…</option>
                  {publishedSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                      {s.edition ? ` (${s.edition})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  disabled={!paperSourceId || busy}
                  onClick={() => void downloadPaper("trainee")}
                >
                  Download quiz
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!paperSourceId || busy}
                  onClick={() => void downloadPaper("key")}
                >
                  Download answer key
                </button>
              </div>
            </div>
            {!publishedSources.length ? (
              <p className="text-muted small mb-0 mt-3">
                Publish a course with questions before printing a paper quiz.
              </p>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <form className="card border mb-4" onSubmit={(e) => void postPaperResults(e)}>
            <div className="card-body">
              <h6 className="mb-3">Post results</h6>
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="paper-pass">
                    Passing percent
                  </label>
                  <input
                    id="paper-pass"
                    type="number"
                    min={1}
                    max={100}
                    className="form-control"
                    value={paperPassingPercent}
                    onChange={(e) => setPaperPassingPercent(Number(e.target.value) || 70)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="paper-completed">
                    Completed date (optional)
                  </label>
                  <input
                    id="paper-completed"
                    type="date"
                    className="form-control"
                    value={paperCompletedAt}
                    onChange={(e) => setPaperCompletedAt(e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="paper-score-mode">
                    Score entry
                  </label>
                  <select
                    id="paper-score-mode"
                    className="form-select"
                    value={paperScoreMode}
                    onChange={(e) => setPaperScoreMode(e.target.value === "per" ? "per" : "shared")}
                  >
                    <option value="shared">Same percent for all selected</option>
                    <option value="per">Percent per trainee</option>
                  </select>
                </div>
                {paperScoreMode === "shared" ? (
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="paper-shared-pct">
                      Score percent
                    </label>
                    <input
                      id="paper-shared-pct"
                      type="number"
                      min={0}
                      max={100}
                      className="form-control"
                      value={paperSharedPercent}
                      onChange={(e) => setPaperSharedPercent(Number(e.target.value))}
                      required
                    />
                  </div>
                ) : null}
              </div>

              <div className="form-label" id="paper-trainees-label">
                Trainees
              </div>
              <PersonnelCheckboxList
                people={personnelRoster}
                sites={personnelSites}
                departments={personnelDepartments}
                divisionEntries={personnelDivisionEntries}
                valueKey="employeeNumber"
                selected={paperAssignees}
                onChange={setPaperAssignees}
              />

              {paperScoreMode === "per" && paperAssignees.length ? (
                <div className="table-responsive mt-3">
                  <table className="table table-sm align-middle">
                    <thead>
                      <tr>
                        <th>Employee #</th>
                        <th>Name</th>
                        <th style={{ width: 120 }}>Percent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperAssignees.map((employeeNumber) => {
                        const person = personnelRoster.find(
                          (row) => row.employeeNumber.trim() === employeeNumber,
                        );
                        return (
                          <tr key={employeeNumber}>
                            <td>{employeeNumber}</td>
                            <td>{person ? personNameDisplay(person.displayName) : "—"}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                className="form-control form-control-sm"
                                value={paperPercents[employeeNumber] ?? ""}
                                onChange={(e) =>
                                  setPaperPercents((prev) => ({
                                    ...prev,
                                    [employeeNumber]: e.target.value,
                                  }))
                                }
                                required
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="d-flex flex-wrap gap-2 mt-3">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !paperSourceId || !paperAssignees.length}
                >
                  Post results
                </button>
              </div>
            </div>
          </form>
        ) : (
          <p className="text-muted">
            You need training manage permission to post paper quiz results.
          </p>
        )}

        {paperPostSummary ? (
          <div className="card border">
            <div className="card-body">
              <h6 className="mb-2">Posted to {paperPostSummary.sourceTitle}</h6>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Employee #</th>
                      <th>Percent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperPostSummary.posted.map((row) => (
                      <tr key={row.employeeNumber}>
                        <td>{row.employeeNumber}</td>
                        <td>{row.percent}%</td>
                        <td>
                          <span className={`badge ${statusBadge(row.status)}`}>{row.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (section === "stats") {
    return (
      <>
        <SectionHeader
          title="Team progress"
          description="Filter assignment activity by period, course, location, group, or employee."
          actions={
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => void refreshAgency()}
            >
              Refresh
            </button>
          }
        />
        <TrainingTeamProgressRoster roster={teamSummary?.roster ?? []} groups={groups} />
        <h6 className="mb-2 mt-4">Course quiz stats</h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Source</th>
                <th>Attempts</th>
                <th>Correct</th>
                <th>Mastered</th>
                <th>Avg %</th>
              </tr>
            </thead>
            <tbody>
              {(progress?.stats ?? []).map((s) => {
                const title =
                  sources.find((src) => src.id === String(s.sourceId))?.title ?? String(s.sourceId);
                return (
                  <tr key={String(s.id ?? s.sourceId)}>
                    <td>{title}</td>
                    <td>{String(s.attemptCount ?? "—")}</td>
                    <td>{String(s.correctCount ?? "—")}</td>
                    <td>{String(s.masteredCount ?? "—")}</td>
                    <td>{String(s.avgScore ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!progress?.stats?.length ? <p className="text-muted">No quiz stats yet.</p> : null}
      </>
    );
  }

  if (section === "sources") {
    const courseRows = courseListMode === "archived" ? archivedSources : sources;
    const filteredSourceRows = courseRows.filter((s) => {
      const q = query.trim().toLowerCase();
      if (courseGroupFilter && !(s.groupIds ?? []).includes(courseGroupFilter)) return false;
      if (!q) return true;
      return `${s.title} ${s.edition ?? ""} ${s.description ?? ""} ${(s.groupNames ?? []).join(" ")}`
        .toLowerCase()
        .includes(q);
    });
    const editingSource = editingSourceId
      ? (sources.find((source) => source.id === editingSourceId) ?? null)
      : null;

    return (
      <>
        <SectionHeader
          title="Courses"
          description="Build courses with study materials and a quiz/test bank in one place. Tag courses with groups to sort by department."
          actions={
            <div className="d-flex flex-wrap gap-2">
              {canManage && courseListMode === "active" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    closeEditSource();
                    setShowSourceForm((open) => !open);
                  }}
                >
                  {showSourceForm ? "Cancel" : "New course"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={onOpenStudy}
              >
                Company Training Portal
              </button>
            </div>
          }
        />
        {showSourceForm && canManage && courseListMode === "active" ? (
          <TrainingCourseBuilder
            mode="create"
            form={sourceForm}
            onFormChange={setSourceForm}
            canManage={canManage}
            busy={busy}
            groups={groups}
            materials={[]}
            folders={[]}
            unlinkedMaterials={unlinkedMaterials}
            onRefreshMaterials={onRefreshMaterials}
            onRefreshFolders={refreshSourceFolders}
            onRefreshSources={onRefreshSources}
            onError={onError}
            onClose={closeSourceForm}
            onCreated={async (row) => {
              closeSourceForm();
              openEditSource(row);
              await refreshSourceFolders();
            }}
          />
        ) : null}
        {editingSource && canManage && courseListMode === "active" ? (
          <TrainingCourseBuilder
            mode="edit"
            source={editingSource}
            form={sourceEditForm}
            onFormChange={setSourceEditForm}
            canManage={canManage}
            busy={busy}
            groups={groups}
            materials={materialsBySource.get(editingSource.id) ?? []}
            folders={foldersBySource[editingSource.id] ?? []}
            unlinkedMaterials={unlinkedMaterials}
            onRefreshMaterials={onRefreshMaterials}
            onRefreshFolders={refreshSourceFolders}
            onRefreshSources={onRefreshSources}
            onError={onError}
            onClose={closeEditSource}
            onSaved={async () => {
              await onRefreshSources();
            }}
            onOpenAuthor={() => onOpenStudyAuthor(editingSource.id)}
            onPublish={async () => setSourceStatus(editingSource, "PUBLISHED")}
            onUnpublish={async () => setSourceStatus(editingSource, "DRAFT")}
            onDelete={async () => archiveSource(editingSource)}
          />
        ) : null}
        <div className="d-flex flex-wrap gap-2 mb-3 align-items-end">
          {canManage ? (
            <div>
              <label className="form-label small mb-1" htmlFor="course-list-mode">
                Show
              </label>
              <select
                id="course-list-mode"
                className="form-select form-select-sm"
                style={{ minWidth: "10rem" }}
                value={courseListMode}
                onChange={(e) => {
                  const next = e.target.value === "archived" ? "archived" : "active";
                  setCourseListMode(next);
                  if (next === "archived") {
                    closeEditSource();
                    setShowSourceForm(false);
                  }
                }}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          ) : null}
          <div>
            <label className="form-label small mb-1" htmlFor="course-group-filter">
              Filter by group
            </label>
            <select
              id="course-group-filter"
              className="form-select form-select-sm"
              style={{ minWidth: "14rem" }}
              value={courseGroupFilter}
              onChange={(e) => setCourseGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: "22rem" }}
            placeholder="Search courses…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search courses"
          />
        </div>
        <ul className="list-group">
          {filteredSourceRows.map((s) => {
            const published = s.status === "PUBLISHED";
            const archived = courseListMode === "archived" || Boolean(s.archivedAt);
            const linked = materialsBySource.get(s.id) ?? [];
            const building = editingSourceId === s.id;
            const groupLabel = (s.groupNames ?? []).join(", ");
            return (
              <li key={s.id} className={`list-group-item${building ? " border-primary" : ""}`}>
                <div className="d-flex justify-content-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">{s.title}</span>
                      <span
                        className={`badge ${
                          archived
                            ? "bg-label-secondary"
                            : published
                              ? "bg-label-success"
                              : "bg-label-warning"
                        }`}
                      >
                        {archived ? "ARCHIVED" : s.status}
                      </span>
                      {building ? <span className="badge bg-label-primary">Building</span> : null}
                      {(s.groupNames ?? []).map((name) => (
                        <span key={`${s.id}-${name}`} className="badge bg-label-info">
                          {name}
                        </span>
                      ))}
                    </div>
                    <div className="text-muted small">
                      {s.questionCount} questions · {linked.length} material
                      {linked.length === 1 ? "" : "s"}
                      {s.edition ? ` · ${s.edition}` : ""}
                      {groupLabel ? ` · ${groupLabel}` : ""}
                    </div>
                    {s.description ? (
                      <div className="text-muted small mt-1">{s.description}</div>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="d-flex flex-wrap gap-2">
                      {archived ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            onClick={() => void reactivateSource(s)}
                            disabled={busy}
                          >
                            Reactivate
                          </button>
                          {canPurgeCourses ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => void purgeSource(s)}
                              disabled={busy}
                            >
                              Delete permanently
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`btn btn-sm ${building ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => (building ? closeEditSource() : openEditSource(s))}
                          >
                            {building ? "Close builder" : "Build course"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => onOpenStudyAuthor(s.id)}
                          >
                            Author questions
                          </button>
                          {published ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => void setSourceStatus(s, "DRAFT")}
                              disabled={busy}
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => void setSourceStatus(s, "PUBLISHED")}
                              disabled={busy}
                            >
                              Publish
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => void archiveSource(s)}
                            disabled={busy}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
          {!filteredSourceRows.length ? (
            <li className="list-group-item text-muted">
              {courseListMode === "archived"
                ? archivedSources.length
                  ? "No archived courses match your filters."
                  : "No archived courses."
                : sources.length
                  ? "No courses match your filters."
                  : canManage
                    ? "No courses yet. Create one to start building study materials and quiz questions."
                    : "No published courses yet."}
            </li>
          ) : null}
        </ul>
        {canManage ? (
          <p className="text-muted small mt-3 mb-0">
            Use <strong>Build course</strong> to upload study materials (PDF, PowerPoint, video) and
            import quiz/test questions (Excel, CSV, JSON, or PDF) in one workspace. Archive unused
            courses anytime; reactivate them from the Archived list when needed
            {canPurgeCourses ? ", or permanently delete archived courses" : ""}.
          </p>
        ) : null}
      </>
    );
  }

  return null;
}

function rosterPersonLine(person: RosterPerson): string {
  return `${person.employeeNumber ? `#${person.employeeNumber} · ` : ""}${personNameDisplay(person.displayName)}${person.departmentName ? ` · ${person.departmentName}` : ""}${person.siteId ? ` · ${rosterLocationLabel(person)}` : ""}`;
}

function PersonnelGroupMemberPicker({
  people,
  sites = [],
  departments = [],
  divisionEntries = [],
  selected,
  onChange,
}: {
  people: RosterPerson[];
  sites?: LookupOption[];
  departments?: LookupOption[];
  divisionEntries?: DivisionOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [siteFilter, setSiteFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departmentNameFilter, setDepartmentNameFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [availableChecked, setAvailableChecked] = useState<string[]>([]);
  const [memberChecked, setMemberChecked] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const availablePeople = useMemo(() => {
    return sortRosterPeople(
      people.filter((person) => {
        if (selectedSet.has(person.id)) return false;
        if (siteFilter && (person.siteId ?? "") !== siteFilter) return false;
        if (divisionFilter && person.divisionName.trim() !== divisionFilter) return false;
        if (departmentFilter) {
          const deptLabel =
            departmentNameFilter || departments.find((d) => d.id === departmentFilter)?.label || "";
          const name = person.departmentName.trim();
          if (name !== deptLabel && name !== departmentFilter) return false;
        }
        if (nameFilter.trim() && !matchesRosterQuery(person, nameFilter)) return false;
        return true;
      }),
      "firstName",
    );
  }, [
    people,
    selectedSet,
    siteFilter,
    divisionFilter,
    departmentFilter,
    departmentNameFilter,
    departments,
    nameFilter,
  ]);

  const memberPeople = useMemo(() => {
    const byId = new Map(people.map((person) => [person.id, person]));
    const members = selected
      .map((id) => byId.get(id))
      .filter((person): person is RosterPerson => Boolean(person));
    const filtered = nameFilter.trim()
      ? members.filter((person) => matchesRosterQuery(person, nameFilter))
      : members;
    return sortRosterPeople(filtered, "firstName");
  }, [people, selected, nameFilter]);

  function addMembers(ids: string[]) {
    if (!ids.length) return;
    const next = [...selected];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    onChange(next);
    setAvailableChecked((current) => current.filter((id) => !ids.includes(id)));
  }

  function removeMembers(ids: string[]) {
    if (!ids.length) return;
    onChange(selected.filter((id) => !ids.includes(id)));
    setMemberChecked((current) => current.filter((id) => !ids.includes(id)));
  }

  function toggleAvailable(id: string) {
    setAvailableChecked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function toggleMember(id: string) {
    setMemberChecked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  const availableIds = availablePeople.map((person) => person.id);
  const memberIds = memberPeople.map((person) => person.id);
  const allAvailableSelected =
    availableIds.length > 0 && availableIds.every((id) => availableChecked.includes(id));
  const allMembersSelected =
    memberIds.length > 0 && memberIds.every((id) => memberChecked.includes(id));

  function toggleSelectAllAvailable() {
    setAvailableChecked(allAvailableSelected ? [] : availableIds);
  }

  function toggleSelectAllMembers() {
    setMemberChecked(allMembersSelected ? [] : memberIds);
  }

  return (
    <div className="training-group-member-picker">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
        <div className="form-label mb-0">Group membership</div>
        <div className="text-muted small">
          <strong>{memberPeople.length}</strong> in group ·{" "}
          <strong>{availablePeople.length}</strong> available
        </div>
      </div>
      <div className="row g-2 mb-2">
        <OrgLocationCascade
          idPrefix="group-member"
          size="sm"
          colClass="col-md-6"
          locationEmptyLabel="All locations"
          sites={sites}
          departments={departments as DepartmentOption[]}
          divisionEntries={divisionEntries}
          value={{
            siteId: siteFilter,
            siteName: sites.find((site) => site.id === siteFilter)?.label ?? "",
            divisionName: divisionFilter,
            departmentId: departmentFilter,
            departmentName: departmentNameFilter,
          }}
          onChange={(next) => {
            setSiteFilter(next.siteId);
            setDivisionFilter(next.divisionName);
            setDepartmentFilter(next.departmentId);
            setDepartmentNameFilter(next.departmentName?.trim() || "");
          }}
        />
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="group-member-name-filter">
            Name / search
          </label>
          <input
            id="group-member-name-filter"
            className="form-control form-control-sm"
            placeholder="Search employees…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>
      </div>
      <div className="row g-2 align-items-stretch">
        <div className="col-lg-5">
          <div className="training-group-member-picker__panel">
            <div className="training-group-member-picker__header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span>Available employees ({availablePeople.length})</span>
              <div className="form-check mb-0">
                <input
                  id="group-available-select-all"
                  type="checkbox"
                  className="form-check-input"
                  checked={allAvailableSelected}
                  disabled={!availableIds.length}
                  onChange={toggleSelectAllAvailable}
                />
                <label className="form-check-label small" htmlFor="group-available-select-all">
                  Select all
                </label>
              </div>
            </div>
            <div className="training-group-member-picker__list">
              {availablePeople.map((person) => (
                <div key={person.id} className="form-check">
                  <input
                    id={`group-available-${person.id}`}
                    type="checkbox"
                    className="form-check-input"
                    checked={availableChecked.includes(person.id)}
                    onChange={() => toggleAvailable(person.id)}
                  />
                  <label className="form-check-label" htmlFor={`group-available-${person.id}`}>
                    {rosterPersonLine(person)}
                  </label>
                </div>
              ))}
              {!availablePeople.length ? (
                <p className="text-muted small mb-0 px-2 py-1">
                  No available employees match these filters.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="col-lg-2 d-flex flex-lg-column flex-row flex-wrap justify-content-center align-items-center gap-2 py-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            title="Add selected"
            aria-label="Add selected employees to group"
            disabled={!availableChecked.length}
            onClick={() => addMembers(availableChecked)}
          >
            <i className="bx bx-chevron-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            title="Add all visible"
            aria-label="Add all visible employees to group"
            disabled={!availablePeople.length}
            onClick={() => addMembers(availablePeople.map((person) => person.id))}
          >
            <i className="bx bx-chevrons-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="Remove selected"
            aria-label="Remove selected employees from group"
            disabled={!memberChecked.length}
            onClick={() => removeMembers(memberChecked)}
          >
            <i className="bx bx-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="Remove all members"
            aria-label="Remove all employees from group"
            disabled={!memberPeople.length}
            onClick={() => removeMembers(memberPeople.map((person) => person.id))}
          >
            <i className="bx bx-chevrons-left" aria-hidden="true" />
          </button>
        </div>
        <div className="col-lg-5">
          <div className="training-group-member-picker__panel">
            <div className="training-group-member-picker__header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span>Group members ({memberPeople.length})</span>
              <div className="form-check mb-0">
                <input
                  id="group-member-select-all"
                  type="checkbox"
                  className="form-check-input"
                  checked={allMembersSelected}
                  disabled={!memberIds.length}
                  onChange={toggleSelectAllMembers}
                />
                <label className="form-check-label small" htmlFor="group-member-select-all">
                  Select all
                </label>
              </div>
            </div>
            <div className="training-group-member-picker__list">
              {memberPeople.map((person) => (
                <div key={person.id} className="form-check">
                  <input
                    id={`group-member-${person.id}`}
                    type="checkbox"
                    className="form-check-input"
                    checked={memberChecked.includes(person.id)}
                    onChange={() => toggleMember(person.id)}
                  />
                  <label className="form-check-label" htmlFor={`group-member-${person.id}`}>
                    {rosterPersonLine(person)}
                  </label>
                </div>
              ))}
              {!memberPeople.length ? (
                <p className="text-muted small mb-0 px-2 py-1">No members in this group yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonnelCheckboxList({
  people,
  sites = [],
  departments = [],
  divisionEntries = [],
  selected,
  onChange,
  valueKey = "id",
  label,
  showCounts = false,
}: {
  people: RosterPerson[];
  sites?: LookupOption[];
  departments?: LookupOption[];
  divisionEntries?: DivisionOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  valueKey?: "id" | "employeeNumber";
  label?: string;
  showCounts?: boolean;
}) {
  const [siteFilter, setSiteFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departmentNameFilter, setDepartmentNameFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");

  const selectablePeople = useMemo(() => {
    if (valueKey !== "employeeNumber") return people;
    return people.filter((person) => person.employeeNumber.trim());
  }, [people, valueKey]);

  const totalEmployees = selectablePeople.length;
  const selectedCount = useMemo(() => {
    const selectableValues = new Set(
      selectablePeople.map((person) =>
        valueKey === "employeeNumber" ? person.employeeNumber.trim() : person.id,
      ),
    );
    return selected.filter((value) => selectableValues.has(value)).length;
  }, [selectablePeople, selected, valueKey]);

  const visiblePeople = useMemo(() => {
    return selectablePeople.filter((person) => {
      if (siteFilter && (person.siteId ?? "") !== siteFilter) return false;
      if (divisionFilter && person.divisionName.trim() !== divisionFilter) return false;
      if (departmentFilter) {
        const deptLabel =
          departmentNameFilter || departments.find((d) => d.id === departmentFilter)?.label || "";
        const name = person.departmentName.trim();
        if (name !== deptLabel && name !== departmentFilter) return false;
      }
      if (nameFilter.trim() && !matchesRosterQuery(person, nameFilter)) return false;
      return true;
    });
  }, [
    selectablePeople,
    siteFilter,
    divisionFilter,
    departmentFilter,
    departmentNameFilter,
    departments,
    nameFilter,
  ]);

  return (
    <div>
      {label || showCounts ? (
        <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
          {label ? <div className="form-label mb-0">{label}</div> : <span />}
          {showCounts ? (
            <div className="text-muted small">
              <strong>{selectedCount}</strong> selected · <strong>{totalEmployees}</strong> total
              {visiblePeople.length !== totalEmployees ? ` · showing ${visiblePeople.length}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="row g-2 mb-2">
        <OrgLocationCascade
          idPrefix="personnel-check"
          size="sm"
          colClass="col-md-6"
          locationEmptyLabel="All locations"
          sites={sites}
          departments={departments as DepartmentOption[]}
          divisionEntries={divisionEntries}
          value={{
            siteId: siteFilter,
            siteName: sites.find((site) => site.id === siteFilter)?.label ?? "",
            divisionName: divisionFilter,
            departmentId: departmentFilter,
            departmentName: departmentNameFilter,
          }}
          onChange={(next) => {
            setSiteFilter(next.siteId);
            setDivisionFilter(next.divisionName);
            setDepartmentFilter(next.departmentId);
            setDepartmentNameFilter(next.departmentName?.trim() || "");
          }}
        />
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="personnel-name-filter">
            Name / search
          </label>
          <input
            id="personnel-name-filter"
            className="form-control form-control-sm"
            placeholder="Search employees…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>
      </div>
      <div className="training-checkbox-panel" style={{ maxHeight: "12rem" }}>
        {visiblePeople.map((person) => {
          const value = valueKey === "employeeNumber" ? person.employeeNumber.trim() : person.id;
          if (valueKey === "employeeNumber" && !value) return null;
          const checked = selected.includes(value);
          return (
            <div key={person.id} className="form-check">
              <input
                id={`personnel-${person.id}-${valueKey}`}
                type="checkbox"
                className="form-check-input"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked ? selected.filter((entry) => entry !== value) : [...selected, value],
                  )
                }
              />
              <label className="form-check-label" htmlFor={`personnel-${person.id}-${valueKey}`}>
                {rosterPersonLine(person)}
              </label>
            </div>
          );
        })}
        {!visiblePeople.length ? (
          <p className="text-muted small mb-0">
            No active personnel loaded. Add people in Personnel first.
          </p>
        ) : null}
      </div>
    </div>
  );
}
