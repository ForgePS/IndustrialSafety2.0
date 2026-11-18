"use client";

import { useMemo, useState } from "react";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";
import {
  formatTeamActivityWhen,
  formatTeamGroups,
  formatTeamLocation,
  groupTeamActivityByCourse,
  type TeamActivityRow,
} from "@/lib/training-team-activity";

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "PASSED") return "bg-label-success";
  if (normalized === "IN_PROGRESS") return "bg-label-primary";
  if (normalized === "OVERDUE") return "bg-label-danger";
  return "bg-label-secondary";
}

function formatDue(dueAt?: string | null) {
  if (!dueAt) return "No deadline";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "No deadline";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TrainingRecentActivityByCourse({
  roster,
  showTeamDetails = false,
}: {
  roster: TeamActivityRow[];
  showTeamDetails?: boolean;
}) {
  const groups = useMemo(() => groupTeamActivityByCourse(roster), [roster]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  if (!groups.length) {
    return (
      <p className="text-muted mb-0">
        No assignment activity yet. Create an assignment to get started.
      </p>
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {groups.map((group) => {
        const expanded = expandedCourseId === group.sourceId;
        return (
          <div key={group.sourceId} className="card">
            <button
              type="button"
              className="card-header d-flex justify-content-between align-items-center gap-2 w-100 border-0 bg-transparent text-start"
              aria-expanded={expanded}
              onClick={() => setExpandedCourseId(expanded ? null : group.sourceId)}
            >
              <div className="min-w-0">
                <strong>{group.sourceTitle}</strong>
                <div className="small text-muted">
                  {group.rows.length} learner{group.rows.length === 1 ? "" : "s"}
                  {group.completedCount ? ` · ${group.completedCount} completed` : ""}
                  {group.inProgressCount ? ` · ${group.inProgressCount} in progress` : ""}
                </div>
              </div>
              <i className={`bx ${expanded ? "bx-chevron-up" : "bx-chevron-down"}`} aria-hidden />
            </button>
            {expanded ? (
              <div className="card-body pt-0">
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>EMPLOYEE #</th>
                        <th>MEMBER</th>
                        {showTeamDetails ? <th>Location</th> : null}
                        {showTeamDetails ? <th>Group</th> : null}
                        <th>Assignment</th>
                        <th>Status</th>
                        <th>Best score</th>
                        <th>Activity</th>
                        <th>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr
                          key={`${row.assignmentId}-${row.personnelId ?? row.userId ?? row.assigneeId}`}
                        >
                          <td>{row.employeeNumber ?? "—"}</td>
                          <td>
                            {row.personnelId ? (
                              <a
                                href={personFileHref(row.personnelId)}
                                className="text-decoration-none"
                              >
                                {personNameDisplay(row.userLabel)}
                              </a>
                            ) : (
                              personNameDisplay(row.userLabel)
                            )}
                          </td>
                          {showTeamDetails ? <td>{formatTeamLocation(row)}</td> : null}
                          {showTeamDetails ? <td>{formatTeamGroups(row)}</td> : null}
                          <td>{row.assignmentTitle}</td>
                          <td>
                            <span className={`badge ${statusBadge(row.status)}`}>{row.status}</span>
                          </td>
                          <td>{row.bestPercent != null ? `${row.bestPercent}%` : "—"}</td>
                          <td>{formatTeamActivityWhen(row)}</td>
                          <td>{formatDue(row.dueAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
