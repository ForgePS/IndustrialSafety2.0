"use client";

import { useMemo, useState } from "react";
import { TrainingRecentActivityByCourse } from "@/components/training-recent-activity-by-course";
import type { TrainingGroup } from "@/features/training/types";
import {
  buildTeamRosterFilterOptions,
  filterTeamRoster,
  type TeamActivityRow,
  type TeamRosterFilters,
} from "@/lib/training-team-activity";

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

function defaultFilters(): TeamRosterFilters {
  return {
    year: String(new Date().getFullYear()),
    month: "",
    sourceId: "",
    siteId: "",
    groupId: "",
    personnelId: "",
  };
}

export function TrainingTeamProgressRoster({
  roster,
  groups,
}: {
  roster: TeamActivityRow[];
  groups: TrainingGroup[];
}) {
  const [filters, setFilters] = useState<TeamRosterFilters>(defaultFilters);

  const options = useMemo(
    () =>
      buildTeamRosterFilterOptions(
        roster,
        groups.map((g) => ({ id: g.id, name: g.name })),
      ),
    [roster, groups],
  );

  const filteredRoster = useMemo(() => filterTeamRoster(roster, filters), [roster, filters]);

  const employeeOptions = useMemo(() => {
    const scoped = filterTeamRoster(roster, {
      ...filters,
      personnelId: "",
    });
    return buildTeamRosterFilterOptions(
      scoped,
      groups.map((g) => ({ id: g.id, name: g.name })),
    ).employees;
  }, [roster, filters, groups]);

  function updateFilter<K extends keyof TeamRosterFilters>(key: K, value: TeamRosterFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div>
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="team-progress-year">
            Year
          </label>
          <select
            id="team-progress-year"
            className="form-select form-select-sm"
            value={filters.year}
            onChange={(e) => updateFilter("year", e.target.value)}
          >
            {options.years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="team-progress-month">
            Month
          </label>
          <select
            id="team-progress-month"
            className="form-select form-select-sm"
            value={filters.month}
            onChange={(e) => updateFilter("month", e.target.value)}
          >
            {MONTHS.map((month) => (
              <option key={month.value || "all"} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="team-progress-course">
            Course
          </label>
          <select
            id="team-progress-course"
            className="form-select form-select-sm"
            value={filters.sourceId}
            onChange={(e) => updateFilter("sourceId", e.target.value)}
          >
            <option value="">All courses</option>
            {options.courses.map((course) => (
              <option key={course.sourceId} value={course.sourceId}>
                {course.sourceTitle}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small mb-1" htmlFor="team-progress-location">
            Employee location
          </label>
          <select
            id="team-progress-location"
            className="form-select form-select-sm"
            value={filters.siteId}
            onChange={(e) => updateFilter("siteId", e.target.value)}
          >
            <option value="">All locations</option>
            {options.locations.map((location) => (
              <option key={location.siteId} value={location.siteId}>
                {location.siteName}
              </option>
            ))}
          </select>
        </div>
        {options.groups.length ? (
          <div className="col-6 col-md-4 col-lg-2">
            <label className="form-label small mb-1" htmlFor="team-progress-group">
              Employee group
            </label>
            <select
              id="team-progress-group"
              className="form-select form-select-sm"
              value={filters.groupId}
              onChange={(e) => updateFilter("groupId", e.target.value)}
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
          <label className="form-label small mb-1" htmlFor="team-progress-employee">
            Employee
          </label>
          <select
            id="team-progress-employee"
            className="form-select form-select-sm"
            value={filters.personnelId}
            onChange={(e) => updateFilter("personnelId", e.target.value)}
          >
            <option value="">All employees</option>
            {employeeOptions.map((employee) => (
              <option key={employee.personnelId} value={employee.personnelId}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-muted small mb-3">
        Showing {filteredRoster.length} assignment
        {filteredRoster.length === 1 ? "" : "s"}. Select a course to expand learner activity.
      </p>

      <TrainingRecentActivityByCourse roster={filteredRoster} showTeamDetails />
    </div>
  );
}
