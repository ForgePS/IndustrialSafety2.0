"use client";

import { useMemo } from "react";
import { useFieldOrgOptional } from "@/components/field-org-provider";

export type FieldOrgCascadeValue = {
  siteId: string;
  siteName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
};

/** Location → Division → Department cascade for Field create/edit forms (matches industrial web). */
export function FieldOrgCascade({
  value,
  onChange,
  required = false,
  disabled = false,
  idPrefix = "org",
}: {
  value: FieldOrgCascadeValue;
  onChange: (next: FieldOrgCascadeValue) => void;
  required?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const org = useFieldOrgOptional();
  const locations = org?.locations ?? [];
  const loading = org?.loading ?? false;

  const divisionOptions = useMemo(() => {
    if (!value.siteId) return [];
    const divisions = org?.divisions ?? [];
    const departments = org?.departments ?? [];
    const fromDepts = departments
      .filter((d) => !d.locationId || d.locationId === value.siteId)
      .map((d) => d.divisionName)
      .filter((name): name is string => Boolean(name && name.trim()));
    return [...new Set([...divisions, ...fromDepts])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [org?.departments, org?.divisions, value.siteId]);

  const departmentOptions = useMemo(() => {
    if (!value.siteId || !value.divisionName) return [];
    const departments = org?.departments ?? [];
    return departments.filter((d) => {
      if (d.locationId && d.locationId !== value.siteId) return false;
      if (d.divisionName && d.divisionName !== value.divisionName) return false;
      return true;
    });
  }, [org?.departments, value.divisionName, value.siteId]);

  return (
    <>
      <div className="ff-field">
        <label htmlFor={`${idPrefix}-location`}>Location</label>
        <select
          id={`${idPrefix}-location`}
          className="ff-input"
          value={value.siteId}
          disabled={disabled || loading || locations.length === 0}
          required={required}
          onChange={(ev) => {
            const siteId = ev.target.value;
            const siteName = locations.find((loc) => loc.id === siteId)?.name ?? "";
            onChange({
              siteId,
              siteName,
              divisionName: "",
              departmentId: "",
              departmentName: "",
            });
          }}
        >
          <option value="">{locations.length === 0 ? "No locations" : "Select location"}</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ff-field">
        <label htmlFor={`${idPrefix}-division`}>Division</label>
        <select
          id={`${idPrefix}-division`}
          className="ff-input"
          value={value.divisionName}
          disabled={disabled || loading || !value.siteId}
          required={required}
          onChange={(ev) => {
            onChange({
              ...value,
              divisionName: ev.target.value,
              departmentId: "",
              departmentName: "",
            });
          }}
        >
          <option value="">{value.siteId ? "Select division" : "Select location first"}</option>
          {divisionOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="ff-field">
        <label htmlFor={`${idPrefix}-department`}>Department</label>
        <select
          id={`${idPrefix}-department`}
          className="ff-input"
          value={value.departmentId}
          disabled={disabled || loading || !value.siteId || !value.divisionName}
          required={required}
          onChange={(ev) => {
            const departmentId = ev.target.value;
            const departmentName =
              departmentOptions.find((dept) => dept.id === departmentId)?.name ?? "";
            onChange({
              ...value,
              departmentId,
              departmentName,
            });
          }}
        >
          <option value="">
            {value.divisionName ? "Select department" : "Select division first"}
          </option>
          {departmentOptions.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
