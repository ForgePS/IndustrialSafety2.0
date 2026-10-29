"use client";

import { useFieldOrgOptional } from "@/components/field-org-provider";

/** Compact Division / Location / Department selectors for shell + Me. */
export function OrgContextBar({
  compact = false,
  locationEmptyLabel = "All Locations",
}: {
  compact?: boolean;
  /** Empty location option (filters default to All Locations). */
  locationEmptyLabel?: string;
}) {
  const org = useFieldOrgOptional();
  if (!org) return null;

  const {
    selection,
    locations,
    divisions,
    departments,
    loading,
    setLocation,
    setDivision,
    setDepartment,
  } = org;

  const divisionOptions = divisions;
  const departmentOptions = departments.filter((d) => {
    if (selection.locationId && d.locationId && d.locationId !== selection.locationId) return false;
    if (selection.divisionName && d.divisionName && d.divisionName !== selection.divisionName) {
      return false;
    }
    return true;
  });

  return (
    <div className={`ff-org-bar${compact ? " ff-org-bar--compact" : ""}`}>
      <label className="ff-org-field">
        <span className="ff-org-label">Location</span>
        <select
          className="ff-select"
          value={selection.locationId}
          disabled={loading || locations.length === 0}
          onChange={(e) => setLocation(e.target.value)}
          aria-label="Location"
        >
          <option value="">{locations.length === 0 ? "No locations" : locationEmptyLabel}</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ff-org-field">
        <span className="ff-org-label">Division</span>
        <select
          className="ff-select"
          value={selection.divisionName}
          disabled={loading || !selection.locationId}
          onChange={(e) => setDivision(e.target.value)}
          aria-label="Division"
        >
          <option value="">
            {selection.locationId ? "All divisions" : "Select location first"}
          </option>
          {divisionOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="ff-org-field">
        <span className="ff-org-label">Department</span>
        <select
          className="ff-select"
          value={selection.departmentId}
          disabled={loading || !selection.locationId}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Department"
        >
          <option value="">
            {selection.locationId ? "All departments" : "Select location first"}
          </option>
          {departmentOptions.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
