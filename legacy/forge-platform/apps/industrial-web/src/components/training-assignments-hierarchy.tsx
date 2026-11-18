"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TrainingAssignment,
  TrainingGroup,
  TrainingTeamSummary,
} from "@/features/training/types";
import type { RosterPerson } from "@/lib/personnel-directory";
import {
  buildAssignmentFilterOptions,
  buildPersonnelMetaMap,
  defaultAssignmentFilters,
  filterAssignmentRosterForOptions,
  type AssignmentRosterFilters,
} from "@/lib/training-assignment-filters";
import {
  buildCourseAssignmentGroups,
  countVisibleAssignments,
  formatAssignmentDate,
} from "@/lib/training-assignment-groups";
import { TrainingAssignmentQrPanel } from "@/components/training-assignment-qr-panel";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import {
  EMPTY_ORG_FILTER_CATALOGS,
  loadOrgFilterCatalogs,
  type OrgFilterCatalogs,
} from "@/lib/personnel-lookups";
import type { DepartmentOption, DivisionOption } from "@/lib/personnel-assignment";

const MONTHS = [
  { value: "", label: "All months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "PASSED") return "bg-label-success";
  if (normalized === "IN_PROGRESS") return "bg-label-primary";
  if (normalized === "FAILED") return "bg-label-danger";
  if (normalized === "OVERDUE") return "bg-label-danger";
  return "bg-label-secondary";
}

function formatDue(dueAt?: string | null) {
  if (!dueAt) return "No deadline";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatGroups(groupNames?: string[]): string {
  const names = (groupNames ?? []).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

type Props = {
  assignments: TrainingAssignment[];
  roster: TrainingTeamSummary["roster"];
  groups: TrainingGroup[];
  personnelRoster: RosterPerson[];
  canManage: boolean;
  qrAssignmentId: string | null;
  onQrToggle: (assignmentId: string | null) => void;
  onEdit: (assignment: TrainingAssignment) => void;
  onDelete: (assignment: TrainingAssignment) => void;
  onRemoveAssignee: (assignment: TrainingAssignment, assigneeId: string, label: string) => void;
};

export function TrainingAssignmentsHierarchy({
  assignments,
  roster,
  groups,
  personnelRoster,
  canManage,
  qrAssignmentId,
  onQrToggle,
  onEdit,
  onDelete,
  onRemoveAssignee,
}: Props) {
  const [filters, setFilters] = useState<AssignmentRosterFilters>(defaultAssignmentFilters);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [orgCatalogs, setOrgCatalogs] = useState<OrgFilterCatalogs>(EMPTY_ORG_FILTER_CATALOGS);

  useEffect(() => {
    let cancelled = false;
    void loadOrgFilterCatalogs()
      .then((catalogs) => {
        if (!cancelled) setOrgCatalogs(catalogs);
      })
      .catch(() => {
        if (!cancelled) setOrgCatalogs(EMPTY_ORG_FILTER_CATALOGS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const personnelMeta = useMemo(() => buildPersonnelMetaMap(personnelRoster), [personnelRoster]);

  const options = useMemo(
    () =>
      buildAssignmentFilterOptions({
        assignments,
        roster,
        groups: groups.map((group) => ({ id: group.id, name: group.name })),
        metaMap: personnelMeta,
      }),
    [assignments, roster, groups, personnelMeta],
  );

  const employeeOptions = useMemo(() => {
    const scopedRoster = filterAssignmentRosterForOptions(
      roster,
      { ...filters, personnelId: "" },
      personnelMeta,
    );
    return buildAssignmentFilterOptions({
      assignments,
      roster: scopedRoster,
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
      metaMap: personnelMeta,
    }).employees;
  }, [assignments, roster, groups, filters, personnelMeta]);

  const courseGroups = useMemo(
    () =>
      buildCourseAssignmentGroups({
        assignments,
        roster,
        filters,
        personnelMeta,
      }),
    [assignments, roster, filters, personnelMeta],
  );

  const visibleAssignmentCount = useMemo(
    () => countVisibleAssignments(courseGroups),
    [courseGroups],
  );
  const visibleAssigneeCount = useMemo(
    () => courseGroups.reduce((sum, course) => sum + course.assigneeCount, 0),
    [courseGroups],
  );
  const activeYear = filters.year.trim() || String(new Date().getFullYear());

  function updateFilter<K extends keyof AssignmentRosterFilters>(
    key: K,
    value: AssignmentRosterFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setExpandedCourseId(null);
    setExpandedMonthKey(null);
  }

  function clearFilters() {
    setFilters(defaultAssignmentFilters());
    setExpandedCourseId(null);
    setExpandedMonthKey(null);
  }

  const hasActiveFilters =
    filters.month ||
    filters.sourceId ||
    filters.siteId ||
    filters.divisionName ||
    filters.departmentName ||
    filters.groupId ||
    filters.personnelId ||
    filters.status ||
    filters.query.trim();

  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="assignment-filter-year">
            Year
          </label>
          <select
            id="assignment-filter-year"
            className="form-select form-select-sm"
            value={filters.year}
            onChange={(event) => updateFilter("year", event.target.value)}
          >
            {options.years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="assignment-filter-month">
            Month
          </label>
          <select
            id="assignment-filter-month"
            className="form-select form-select-sm"
            value={filters.month}
            onChange={(event) => updateFilter("month", event.target.value)}
          >
            {MONTHS.map((month) => (
              <option key={month.value || "all"} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="assignment-filter-course">
            Course
          </label>
          <select
            id="assignment-filter-course"
            className="form-select form-select-sm"
            value={filters.sourceId}
            onChange={(event) => updateFilter("sourceId", event.target.value)}
          >
            <option value="">All courses</option>
            {options.courses.map((course) => (
              <option key={course.sourceId} value={course.sourceId}>
                {course.sourceTitle}
              </option>
            ))}
          </select>
        </div>
        <OrgLocationCascade
          idPrefix="assignment-filter"
          size="sm"
          colClass="col-6 col-md-4 col-lg-2"
          locationEmptyLabel="All locations"
          sites={orgCatalogs.sites}
          departments={orgCatalogs.departments as DepartmentOption[]}
          divisionEntries={orgCatalogs.divisionEntries as DivisionOption[]}
          value={{
            siteId: filters.siteId,
            siteName: orgCatalogs.sites.find((site) => site.id === filters.siteId)?.label ?? "",
            divisionName: filters.divisionName,
            departmentId:
              orgCatalogs.departments.find(
                (dept) =>
                  dept.label.trim().toLowerCase() === filters.departmentName.trim().toLowerCase(),
              )?.id ?? "",
            departmentName: filters.departmentName,
          }}
          onChange={(next) => {
            setFilters((current) => ({
              ...current,
              siteId: next.siteId,
              divisionName: next.divisionName,
              departmentName: next.departmentName?.trim() || "",
            }));
            setExpandedCourseId(null);
            setExpandedMonthKey(null);
          }}
        />
        {options.groups.length ? (
          <div className="col-6 col-md-4 col-lg-2">
            <label className="form-label small mb-1" htmlFor="assignment-filter-group">
              Group
            </label>
            <select
              id="assignment-filter-group"
              className="form-select form-select-sm"
              value={filters.groupId}
              onChange={(event) => updateFilter("groupId", event.target.value)}
            >
              <option value="">All groups</option>
              {options.groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="assignment-filter-employee">
            Employee
          </label>
          <select
            id="assignment-filter-employee"
            className="form-select form-select-sm"
            value={filters.personnelId}
            onChange={(event) => updateFilter("personnelId", event.target.value)}
          >
            <option value="">All employees</option>
            {employeeOptions.map((employee) => (
              <option key={employee.personnelId} value={employee.personnelId}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="assignment-filter-status">
            Status
          </label>
          <select
            id="assignment-filter-status"
            className="form-select form-select-sm"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {options.statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-8 col-lg-4">
          <label className="form-label small mb-1" htmlFor="assignment-filter-search">
            Name / search
          </label>
          <input
            id="assignment-filter-search"
            className="form-control form-control-sm"
            placeholder="Course, assignment, employee, department…"
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
          />
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-3">
        <div className="text-muted small">
          {courseGroups.length} course{courseGroups.length === 1 ? "" : "s"} ·{" "}
          {visibleAssignmentCount} assignment{visibleAssignmentCount === 1 ? "" : "s"} ·{" "}
          {visibleAssigneeCount} assignee
          {visibleAssigneeCount === 1 ? "" : "s"} in {activeYear}
        </div>
        {hasActiveFilters ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {!courseGroups.length ? (
        <div className="card border">
          <div className="card-body text-muted">
            No assignments found for {activeYear}
            {hasActiveFilters ? " matching your filters" : ""}.
          </div>
        </div>
      ) : (
        <div className="accordion" id="training-assignment-courses">
          {courseGroups.map((course) => {
            const courseOpen = expandedCourseId === course.sourceId;
            const courseHeadingId = `course-${course.sourceId}`;
            const coursePanelId = `course-panel-${course.sourceId}`;
            return (
              <div className="accordion-item" key={course.sourceId}>
                <h2 className="accordion-header" id={courseHeadingId}>
                  <button
                    type="button"
                    className={`accordion-button${courseOpen ? "" : " collapsed"}`}
                    aria-expanded={courseOpen}
                    aria-controls={coursePanelId}
                    onClick={() => {
                      setExpandedCourseId((current) =>
                        current === course.sourceId ? null : course.sourceId,
                      );
                      setExpandedMonthKey(null);
                    }}
                  >
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 w-100 pe-3">
                      <span className="fw-semibold">{course.sourceTitle}</span>
                      <span className="text-muted small">
                        {course.months.length} month{course.months.length === 1 ? "" : "s"} ·{" "}
                        {course.assignmentCount} assignment{course.assignmentCount === 1 ? "" : "s"}{" "}
                        · {course.assigneeCount} assignee{course.assigneeCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                </h2>
                <div
                  id={coursePanelId}
                  className={`accordion-collapse collapse${courseOpen ? " show" : ""}`}
                  aria-labelledby={courseHeadingId}
                >
                  <div className="accordion-body p-2">
                    <div className="accordion" id={`training-assignment-months-${course.sourceId}`}>
                      {course.months.map((month) => {
                        const monthToken = `${course.sourceId}:${month.monthKey}`;
                        const monthOpen = expandedMonthKey === monthToken;
                        const monthHeadingId = `month-${course.sourceId}-${month.monthKey}`;
                        const monthPanelId = `month-panel-${course.sourceId}-${month.monthKey}`;
                        const monthAssignees = month.batches.reduce(
                          (sum, batch) => sum + batch.personnel.length,
                          0,
                        );
                        return (
                          <div className="accordion-item border-0" key={month.monthKey}>
                            <h3 className="accordion-header" id={monthHeadingId}>
                              <button
                                type="button"
                                className={`accordion-button py-2${monthOpen ? "" : " collapsed"}`}
                                aria-expanded={monthOpen}
                                aria-controls={monthPanelId}
                                onClick={() =>
                                  setExpandedMonthKey((current) =>
                                    current === monthToken ? null : monthToken,
                                  )
                                }
                              >
                                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 w-100 pe-3">
                                  <span>{month.monthLabel}</span>
                                  <span className="text-muted small">
                                    {month.batches.length} batch
                                    {month.batches.length === 1 ? "" : "es"} · {monthAssignees}{" "}
                                    assignee{monthAssignees === 1 ? "" : "s"}
                                  </span>
                                </div>
                              </button>
                            </h3>
                            <div
                              id={monthPanelId}
                              className={`accordion-collapse collapse${monthOpen ? " show" : ""}`}
                              aria-labelledby={monthHeadingId}
                            >
                              <div className="accordion-body pt-0">
                                {month.batches.map((batch) => {
                                  const assignment = batch.assignment;
                                  const completionPct = assignment.assigneeCount
                                    ? Math.round(
                                        (assignment.completedCount / assignment.assigneeCount) *
                                          100,
                                      )
                                    : 0;
                                  return (
                                    <div key={assignment.id} className="card border mb-3">
                                      <div className="card-body">
                                        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                                          <div>
                                            <div className="fw-semibold">{assignment.title}</div>
                                            <div className="text-muted small">
                                              Assigned {formatAssignmentDate(assignment.createdAt)}{" "}
                                              · {assignment.completedCount}/
                                              {assignment.assigneeCount} complete ({completionPct}%)
                                              · Pass {assignment.passingPercent}% ·{" "}
                                              {formatDue(assignment.dueAt)}
                                              {assignment.hasPublicQr ? " · QR active" : ""}
                                            </div>
                                          </div>
                                          {canManage ? (
                                            <div className="d-flex gap-2">
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary"
                                                onClick={() =>
                                                  onQrToggle(
                                                    qrAssignmentId === assignment.id
                                                      ? null
                                                      : assignment.id,
                                                  )
                                                }
                                              >
                                                QR
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={() => onEdit(assignment)}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => onDelete(assignment)}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>

                                        {canManage && qrAssignmentId === assignment.id ? (
                                          <div className="mb-3">
                                            <TrainingAssignmentQrPanel
                                              assignmentId={assignment.id}
                                              assignmentTitle={assignment.title}
                                              hasPublicQr={Boolean(assignment.hasPublicQr)}
                                              canManage={canManage}
                                            />
                                          </div>
                                        ) : null}

                                        <div className="table-responsive">
                                          <table className="table table-sm align-middle mb-0">
                                            <thead>
                                              <tr>
                                                <th>Assigned</th>
                                                <th>EMPLOYEE #</th>
                                                <th>Personnel</th>
                                                <th>Location</th>
                                                <th>Division</th>
                                                <th>Department</th>
                                                <th>Group</th>
                                                <th>Status</th>
                                                <th>Best %</th>
                                                <th>Due</th>
                                                <th>Completed</th>
                                                {canManage ? (
                                                  <th className="text-end">Actions</th>
                                                ) : null}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {batch.personnel.map((person) => (
                                                <tr
                                                  key={`${person.assignmentId}-${person.employeeNumber ?? person.userLabel}`}
                                                >
                                                  <td>{formatAssignmentDate(person.assignedAt)}</td>
                                                  <td>{person.employeeNumber ?? "—"}</td>
                                                  <td>{person.userLabel}</td>
                                                  <td>{person.siteName ?? "—"}</td>
                                                  <td>{person.divisionName ?? "—"}</td>
                                                  <td>{person.departmentName ?? "—"}</td>
                                                  <td>{formatGroups(person.groupNames)}</td>
                                                  <td>
                                                    <span
                                                      className={`badge rounded-pill ${statusBadge(person.status)}`}
                                                    >
                                                      {person.status.replace(/_/g, " ")}
                                                    </span>
                                                  </td>
                                                  <td>
                                                    {person.bestPercent != null
                                                      ? `${person.bestPercent}%`
                                                      : "—"}
                                                  </td>
                                                  <td>{formatDue(person.dueAt)}</td>
                                                  <td>
                                                    {formatAssignmentDate(person.completedAt)}
                                                  </td>
                                                  {canManage ? (
                                                    <td className="text-end">
                                                      {person.status.toUpperCase() ===
                                                      "NOT_STARTED" ? (
                                                        <button
                                                          type="button"
                                                          className="btn btn-sm btn-outline-danger"
                                                          onClick={() =>
                                                            onRemoveAssignee(
                                                              assignment,
                                                              person.assigneeId,
                                                              person.userLabel,
                                                            )
                                                          }
                                                        >
                                                          Remove
                                                        </button>
                                                      ) : (
                                                        <span className="text-muted small">—</span>
                                                      )}
                                                    </td>
                                                  ) : null}
                                                </tr>
                                              ))}
                                              {!batch.personnel.length ? (
                                                <tr>
                                                  <td
                                                    colSpan={canManage ? 12 : 11}
                                                    className="text-muted"
                                                  >
                                                    No assignees match the current filters.
                                                  </td>
                                                </tr>
                                              ) : null}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
