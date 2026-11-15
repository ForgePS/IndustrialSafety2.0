"use client";

import { useEffect, useMemo } from "react";
import {
  filterDepartmentsForSite,
  filterDepartmentsForSiteDivision,
  divisionsForLocationCascade,
  shouldRetainDepartmentSelection,
  shouldRetainDivisionSelection,
  type DepartmentOption,
  type DivisionOption,
} from "@/lib/personnel-assignment";

export type OrgLocationCascadeValue = {
  siteId: string;
  siteName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
};

export type OrgLocationCascadeProps = {
  value: OrgLocationCascadeValue;
  onChange: (next: OrgLocationCascadeValue) => void;
  sites: ReadonlyArray<{ id: string; label: string }>;
  departments: ReadonlyArray<DepartmentOption>;
  divisionEntries: ReadonlyArray<DivisionOption>;
  /** When true, Location (and usually Division/Department) are required. */
  required?: boolean;
  /** Override whether the department/area field is required (defaults to `required`). */
  departmentRequired?: boolean;
  disabled?: boolean;
  loading?: boolean;
  idPrefix?: string;
  /**
   * When true, department lists may also include rows with no siteId.
   * Division options for a selected location are always site-strict.
   */
  includeUnscoped?: boolean;
  /** Optional extra column class for each field (default col-md-4). */
  colClass?: string;
  /** Hide division when a surface only needs location + department. */
  showDivision?: boolean;
  /** Hide department when a surface only needs location + division. */
  showDepartment?: boolean;
  /** Override the Department field label (e.g. "Area" in Sanitation). */
  departmentLabel?: string;
  /** Empty location option label (filters: "All locations"). */
  locationEmptyLabel?: string;
  /** Empty department option when filters allow "all". */
  departmentEmptyLabel?: string;
  /** Compact selects for filter toolbars. */
  size?: "sm" | "md";
};

/**
 * Standard Location → Division → Department cascade.
 * Company/tenant is implicit and not shown.
 * Order is required: Location before Division, Division before Department.
 */
export function OrgLocationCascade({
  value,
  onChange,
  sites,
  departments,
  divisionEntries,
  required = false,
  departmentRequired,
  disabled = false,
  loading = false,
  idPrefix = "org",
  includeUnscoped = false,
  colClass = "col-md-4",
  showDivision = true,
  showDepartment = true,
  departmentLabel = "Department",
  locationEmptyLabel = "Select location",
  departmentEmptyLabel,
  size = "md",
}: OrgLocationCascadeProps) {
  const siteId = value.siteId;
  const divisionName = value.divisionName;
  const selectClass = size === "sm" ? "form-select form-select-sm" : "form-select";
  const labelClass = size === "sm" ? "form-label small mb-1" : "form-label";
  const filterOpts = useMemo(() => ({ includeUnscoped }), [includeUnscoped]);
  const requireDepartment = departmentRequired ?? required;

  const divisionsForSite = useMemo(
    () =>
      divisionsForLocationCascade(divisionEntries, departments, siteId || undefined, filterOpts),
    [departments, divisionEntries, filterOpts, siteId],
  );

  const departmentsForCascade = useMemo(() => {
    if (!siteId) return [];
    if (showDivision) {
      if (!divisionName.trim()) return [];
      return filterDepartmentsForSiteDivision(departments, siteId, divisionName, {
        includeUnscoped: false,
      });
    }
    return filterDepartmentsForSite(departments, siteId, filterOpts);
  }, [departments, divisionName, filterOpts, showDivision, siteId]);

  useEffect(() => {
    if (shouldRetainDepartmentSelection(value.departmentId, departments, departmentsForCascade)) {
      return;
    }
    onChange({
      ...value,
      departmentId: "",
      departmentName: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to filter invalidation
  }, [departments, departmentsForCascade, value.departmentId]);

  useEffect(() => {
    if (!siteId) {
      if (!value.divisionName && !value.departmentId) return;
      onChange({
        ...value,
        divisionName: "",
        departmentId: "",
        departmentName: "",
      });
      return;
    }
    if (shouldRetainDivisionSelection(value.divisionName, divisionEntries, divisionsForSite)) {
      return;
    }
    onChange({
      ...value,
      divisionName: "",
      departmentId: "",
      departmentName: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to filter invalidation
  }, [divisionEntries, divisionsForSite, siteId, value.divisionName]);

  const locationId = `${idPrefix}-location`;
  const divisionId = `${idPrefix}-division`;
  const departmentId = `${idPrefix}-department`;
  const locationLocked = disabled || loading;
  const divisionLocked = locationLocked || !siteId;
  const departmentLocked = locationLocked || !siteId || (showDivision && !divisionName.trim());

  return (
    <>
      <div className={colClass}>
        <label className={labelClass} htmlFor={locationId}>
          Location{required ? " *" : ""}
        </label>
        <select
          id={locationId}
          className={selectClass}
          required={required}
          disabled={locationLocked}
          value={siteId}
          onChange={(ev) => {
            const nextSiteId = ev.target.value;
            if (!nextSiteId) {
              onChange({
                siteId: "",
                siteName: "",
                divisionName: "",
                departmentId: "",
                departmentName: "",
              });
              return;
            }
            const match = sites.find((site) => site.id === nextSiteId);
            const nextDivs = divisionsForLocationCascade(
              divisionEntries,
              departments,
              nextSiteId,
              filterOpts,
            );
            const keepDiv = shouldRetainDivisionSelection(
              value.divisionName,
              divisionEntries,
              nextDivs,
            );
            const nextDivision = keepDiv ? value.divisionName : "";
            const nextDepts = showDivision
              ? filterDepartmentsForSiteDivision(
                  departments,
                  nextSiteId,
                  nextDivision || undefined,
                  { includeUnscoped: false },
                )
              : filterDepartmentsForSite(departments, nextSiteId, filterOpts);
            const keepDept =
              Boolean(nextDivision || !showDivision) &&
              shouldRetainDepartmentSelection(value.departmentId, departments, nextDepts);
            onChange({
              siteId: nextSiteId,
              siteName: match?.label ?? "",
              divisionName: nextDivision,
              departmentId: keepDept ? value.departmentId : "",
              departmentName: keepDept ? value.departmentName || "" : "",
            });
          }}
        >
          <option value="">{loading ? "Loading locations…" : locationEmptyLabel}</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.label}
            </option>
          ))}
          {siteId && value.siteName && !sites.some((site) => site.id === siteId) ? (
            <option value={siteId}>{value.siteName}</option>
          ) : null}
        </select>
      </div>

      {showDivision ? (
        <div className={colClass}>
          <label className={labelClass} htmlFor={divisionId}>
            Division{required ? " *" : ""}
          </label>
          <select
            id={divisionId}
            className={selectClass}
            required={required && Boolean(siteId)}
            disabled={divisionLocked}
            title={!siteId ? "Select a location before choosing a division" : undefined}
            value={divisionLocked ? "" : value.divisionName}
            onChange={(ev) => {
              const nextDivision = ev.target.value;
              if (!nextDivision) {
                onChange({
                  ...value,
                  divisionName: "",
                  departmentId: "",
                  departmentName: "",
                });
                return;
              }
              const nextDepts = filterDepartmentsForSiteDivision(
                departments,
                siteId || undefined,
                nextDivision,
                { includeUnscoped: false },
              );
              const keepDept = shouldRetainDepartmentSelection(
                value.departmentId,
                departments,
                nextDepts,
              );
              onChange({
                ...value,
                divisionName: nextDivision,
                departmentId: keepDept ? value.departmentId : "",
                departmentName: keepDept ? value.departmentName || "" : "",
              });
            }}
          >
            <option value="">
              {!siteId
                ? "Select location first"
                : size === "sm"
                  ? "All divisions"
                  : "Select division"}
            </option>
            {!divisionLocked
              ? divisionsForSite.map((division) => (
                  <option key={`${division.siteId ?? ""}:${division.name}`} value={division.name}>
                    {division.name}
                  </option>
                ))
              : null}
            {!divisionLocked &&
            value.divisionName &&
            !divisionsForSite.some(
              (division) => division.name.toLowerCase() === value.divisionName.trim().toLowerCase(),
            ) ? (
              <option value={value.divisionName}>{value.divisionName}</option>
            ) : null}
          </select>
        </div>
      ) : null}

      {showDepartment ? (
        <div className={colClass}>
          <label className={labelClass} htmlFor={departmentId}>
            {departmentLabel}
            {requireDepartment ? " *" : ""}
          </label>
          <select
            id={departmentId}
            className={selectClass}
            required={
              requireDepartment && Boolean(siteId) && (!showDivision || Boolean(divisionName))
            }
            disabled={departmentLocked}
            title={
              !siteId
                ? `Select a location before choosing a ${departmentLabel.toLowerCase()}`
                : showDivision && !divisionName.trim()
                  ? `Select a division before choosing a ${departmentLabel.toLowerCase()}`
                  : undefined
            }
            value={departmentLocked ? "" : value.departmentId}
            onChange={(ev) => {
              const nextId = ev.target.value;
              const match = departmentsForCascade.find((dept) => dept.id === nextId);
              onChange({
                ...value,
                departmentId: nextId,
                departmentName: match?.label ?? "",
              });
            }}
          >
            <option value="">
              {!siteId
                ? "Select location first"
                : showDivision && !divisionName.trim()
                  ? "Select division first"
                  : departmentEmptyLabel
                    ? departmentEmptyLabel
                    : size === "sm"
                      ? `All ${departmentLabel.toLowerCase()}s`
                      : requireDepartment
                        ? `Select ${departmentLabel.toLowerCase()}`
                        : "None"}
            </option>
            {!departmentLocked
              ? departmentsForCascade.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.label}
                  </option>
                ))
              : null}
            {!departmentLocked &&
            value.departmentId &&
            value.departmentName &&
            !departmentsForCascade.some((dept) => dept.id === value.departmentId) ? (
              <option value={value.departmentId}>{value.departmentName}</option>
            ) : null}
          </select>
          {!departmentLocked && departmentsForCascade.length === 0 && departments.length > 0 ? (
            <div className="form-text">
              No {departmentLabel.toLowerCase()}s linked to this{" "}
              {showDivision ? "division" : "location"} yet. Add them under Settings → Dropdown
              lists.
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
