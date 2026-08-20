"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { YearSelectDateInput } from "@/components/year-select-date-input";
import { LicenseImageField } from "@/components/license-image-field";
import { isBirthDateField } from "@/lib/date-field";
import {
  EMPTY_ASSIGNMENT_OPTIONS,
  filterDepartmentsForSite,
  suggestSupervisor,
  type AssignmentOptions,
} from "@/lib/personnel-assignment";
import {
  PERSONNEL_FORM_SECTIONS,
  isAcceptableSignature,
  isOversizedSignature,
  personnelDisplayName,
  validatePersonnelForm,
  type PersonnelField,
  type PersonnelFormValues,
  type PersonnelSelectOption,
} from "@/lib/personnel-form";
import {
  EMPTY_LOOKUPS,
  loadAssignmentOptions,
  loadPersonnelLookups,
  resolveLookupLabel,
  type LookupState,
} from "@/lib/personnel-lookups";
import { resolvePersonnelLocationLabel } from "@/lib/personnel-file";
import { matchSiteIdByLabel } from "@/lib/industrial-facility";
import { nextPpeExpiresDate } from "@/lib/personnel-ppe";

const ROSTER_HREF = "/modules/personnel/";

/** Leading input-group icon, so contact and auto-filled fields read at a glance. */
function adornmentFor(field: PersonnelField): string | null {
  if (field.readOnly) return "bx-lock-alt";
  if (field.type === "email") return "bx-envelope";
  if (field.type === "tel") return "bx-phone";
  return null;
}

export type PersonnelPersonFormProps = {
  mode: "create" | "edit";
  initialValues: PersonnelFormValues;
  /** After a successful save. Create returns to a blank form; edit navigates away. */
  onSubmit: (values: PersonnelFormValues, lookups: LookupState) => Promise<void>;
  cancelHref: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  breadcrumbCurrent: string;
  tenantId?: string;
};

/**
 * Shared Add / Edit personnel form. Supervisor auto-fill only runs after the
 * user changes Division, Location, or Department so an edit load does not
 * overwrite a custom supervisor on mount.
 */
export function PersonnelPersonForm({
  mode,
  initialValues,
  onSubmit,
  cancelHref,
  title,
  subtitle,
  submitLabel,
  breadcrumbCurrent,
  tenantId,
}: PersonnelPersonFormProps) {
  const [values, setValues] = useState<PersonnelFormValues>(initialValues);
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [assignment, setAssignment] = useState<AssignmentOptions>(EMPTY_ASSIGNMENT_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentTouched = useRef(mode === "create");

  useEffect(() => {
    setValues(initialValues);
    assignmentTouched.current = mode === "create";
  }, [initialValues, mode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextLookups, nextAssignment] = await Promise.all([
        loadPersonnelLookups(tenantId),
        loadAssignmentOptions(),
      ]);
      if (cancelled) return;
      setLookups(nextLookups);
      setAssignment(nextAssignment);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const siteId = typeof values.siteId === "string" ? values.siteId : "";
  const siteName = typeof values.siteName === "string" ? values.siteName : "";
  const departmentId = typeof values.departmentId === "string" ? values.departmentId : "";
  const divisionName = typeof values.divisionName === "string" ? values.divisionName : "";

  const effectiveSiteId = useMemo(() => {
    if (siteId) return siteId;
    if (lookups.sites.length === 0) return "";
    return matchSiteIdByLabel(lookups.sites, siteName) ?? "";
  }, [lookups.sites, siteId, siteName]);

  useEffect(() => {
    if (siteId || lookups.sites.length === 0) return;
    const matched = matchSiteIdByLabel(lookups.sites, siteName);
    if (!matched) return;
    setValues((prev) => ({ ...prev, siteId: matched }));
  }, [lookups.sites, siteId, siteName]);

  const departmentsForSite = useMemo(
    () => filterDepartmentsForSite(lookups.departments, effectiveSiteId || undefined),
    [lookups.departments, effectiveSiteId],
  );

  useEffect(() => {
    if (!departmentId) return;
    const stillValid = departmentsForSite.some((d) => d.id === departmentId);
    if (!stillValid) {
      setValues((prev) => ({ ...prev, departmentId: "", departmentName: "" }));
    }
  }, [departmentsForSite, departmentId]);

  useEffect(() => {
    if (!assignmentTouched.current) return;
    const next = suggestSupervisor(assignment.supervisors, divisionName, effectiveSiteId, departmentId);
    setValues((prev) => {
      const current = typeof prev.supervisorName === "string" ? prev.supervisorName : "";
      if ((next ?? "") === current) return prev;
      return { ...prev, supervisorName: next ?? "" };
    });
  }, [assignment.supervisors, divisionName, effectiveSiteId, departmentId]);

  const displayName = personnelDisplayName(values);

  const divisionOptions: PersonnelSelectOption[] = useMemo(
    () => assignment.divisions.map((d) => ({ value: d, label: d })),
    [assignment.divisions],
  );

  function set(name: string, value: string | boolean) {
    if (name === "siteId" || name === "departmentId" || name === "divisionName") {
      assignmentTouched.current = true;
    }
    setValues((prev) => {
      const next: PersonnelFormValues = { ...prev, [name]: value };
      if (
        typeof value === "string" &&
        name.endsWith("IssuedDate") &&
        value.trim() !== ""
      ) {
        const expiresKey = name.replace(/IssuedDate$/, "ExpiresDate");
        const currentExpires =
          typeof prev[expiresKey] === "string" ? (prev[expiresKey] as string).trim() : "";
        next[expiresKey] = nextPpeExpiresDate(value, currentExpires);
      }
      return next;
    });
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (saving) return;

    const missing = validatePersonnelForm(values);
    if (missing.length > 0) {
      setError(`Required: ${missing.join(", ")}`);
      return;
    }

    const signature = typeof values.signatureUrl === "string" ? values.signatureUrl : "";
    const initialSignature =
      typeof initialValues.signatureUrl === "string" ? initialValues.signatureUrl : "";
    if (signature.trim() !== initialSignature.trim() && !isAcceptableSignature(signature)) {
      setError(
        isOversizedSignature(signature.trim())
          ? "Signature is too large to save. Clear it and sign again more simply."
          : "Signature could not be saved. Clear it and sign again.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(values, lookups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this person.");
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: PersonnelField, stacked = false) {
    const raw = values[field.name];
    const stringValue = typeof raw === "string" ? raw : "";
    const colClass = stacked || field.wide ? "col-12" : "col-md-6";

    const label = (htmlFor: string, text?: string) => (
      <label className="form-label" htmlFor={htmlFor}>
        {text ?? field.label}
        {field.required ? <span className="text-danger ms-1">*</span> : null}
      </label>
    );
    const help = field.help ? <div className="form-text">{field.help}</div> : null;
    const merged = (control: ReactNode) => {
      const adornment = adornmentFor(field);
      if (!adornment) return control;
      return (
        <div className="input-group input-group-merge">
          <span className="input-group-text">
            <i className={`bx ${adornment}`} aria-hidden="true" />
          </span>
          {control}
        </div>
      );
    };

    if (field.type === "checkbox") {
      return (
        <div className={colClass} key={field.name}>
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id={field.name}
              checked={raw === true}
              onChange={(ev) => set(field.name, ev.target.checked)}
            />
            <label className="form-check-label" htmlFor={field.name}>
              {field.label}
            </label>
          </div>
          {help}
        </div>
      );
    }

    if (field.type === "signature") {
      return (
        <div className={colClass} key={field.name}>
          <SignaturePad
            label={field.label}
            value={stringValue}
            onChange={(dataUrl) => set(field.name, dataUrl)}
            disabled={saving}
          />
        </div>
      );
    }

    if (field.type === "image") {
      return (
        <div className={colClass} key={field.name}>
          <LicenseImageField
            id={field.name}
            label={field.label}
            value={stringValue}
            {...(field.help ? { help: field.help } : {})}
            disabled={saving}
            onChange={(dataUrl) => set(field.name, dataUrl)}
          />
        </div>
      );
    }

    if (field.type === "select" || field.name === "divisionName") {
      const options = field.name === "divisionName" ? divisionOptions : (field.options ?? []);
      const empty = field.name === "divisionName" && options.length === 0;

      return (
        <div className={colClass} key={field.name}>
          {label(field.name)}
          <select
            id={field.name}
            className="form-select"
            required={field.required}
            value={stringValue}
            disabled={empty}
            onChange={(ev) => set(field.name, ev.target.value)}
          >
            {field.name === "divisionName" ? (
              <option value="">{empty ? "None available" : "Select division"}</option>
            ) : null}
            {field.name === "safetyFootwearClass" ? (
              <option value="">Not tracked</option>
            ) : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    }

    if (field.type === "lookup") {
      const options =
        field.source === "departments"
          ? departmentsForSite
          : field.source
            ? lookups[field.source]
            : [];

      if (options.length === 0 && field.nameField) {
        const nameKey = field.nameField;
        const typed = typeof values[nameKey] === "string" ? (values[nameKey] as string) : "";
        return (
          <div className={colClass} key={field.name}>
            {label(nameKey, field.fallbackLabel ?? field.label)}
            <input
              id={nameKey}
              type="text"
              className="form-control"
              value={typed}
              onChange={(ev) => set(nameKey, ev.target.value)}
            />
            <div className="form-text">
              No {field.label.toLowerCase()} catalog yet, so this is free text.
            </div>
          </div>
        );
      }

      const waitingOnSite =
        field.source === "departments" && lookups.sites.length > 0 && !effectiveSiteId;
      return (
        <div className={colClass} key={field.name}>
          {label(field.name)}
          <select
            id={field.name}
            className="form-select"
            value={stringValue}
            disabled={options.length === 0 || waitingOnSite}
            onChange={(ev) => set(field.name, ev.target.value)}
          >
            <option value="">
              {waitingOnSite
                ? "Select a location first"
                : options.length === 0
                  ? "None available"
                  : `Select ${field.label.toLowerCase()}`}
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div className={colClass} key={field.name}>
          {label(field.name)}
          <textarea
            id={field.name}
            className="form-control"
            rows={3}
            value={stringValue}
            readOnly={field.readOnly}
            {...(field.placeholder ? { placeholder: field.placeholder } : {})}
            onChange={(ev) => set(field.name, ev.target.value)}
          />
          {help}
        </div>
      );
    }

    if (field.type === "date" && isBirthDateField({ name: field.name, label: field.label })) {
      return (
        <div className={colClass} key={field.name}>
          {label(field.name)}
          {merged(
            <YearSelectDateInput
              id={field.name}
              value={stringValue}
              onChange={(next) => set(field.name, next)}
              required={field.required === true}
              disabled={field.readOnly === true}
              mode="birth"
            />,
          )}
          {help}
        </div>
      );
    }

    return (
      <div className={colClass} key={field.name}>
        {label(field.name)}
        {merged(
          <input
            id={field.name}
            type={field.type ?? "text"}
            className="form-control"
            required={field.required}
            value={stringValue}
            readOnly={field.readOnly}
            {...(field.placeholder ? { placeholder: field.placeholder } : {})}
            onChange={(ev) => set(field.name, ev.target.value)}
          />,
        )}
        {help}
      </div>
    );
  }

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: "Name", value: displayName || "—" },
    { label: "Status", value: (typeof values.status === "string" && values.status) || "—" },
    { label: "Location", value: resolvePersonnelLocationLabel(values, (id) => resolveLookupLabel(lookups, "sites", id)) || "—" },
    { label: "Division", value: divisionName || "—" },
    {
      label: "Department",
      value:
        (departmentId && resolveLookupLabel(lookups, "departments", departmentId)) ||
        (typeof values.departmentName === "string" && values.departmentName) ||
        "—",
    },
    {
      label: "Supervisor",
      value: (typeof values.supervisorName === "string" && values.supervisorName) || "—",
    },
    { label: "Driver", value: values.isCompanyDriver === true ? "Yes" : "No" },
  ];

  return (
    <div className="ind-addperson">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 py-3">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb breadcrumb-style1 mb-1">
              <li className="breadcrumb-item">
                <Link href={ROSTER_HREF}>Personnel</Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {breadcrumbCurrent}
              </li>
            </ol>
          </nav>
          <h4 className="fw-bold mb-1">{title}</h4>
          <p className="text-muted mb-0">{subtitle}</p>
        </div>
        <Link className="btn btn-outline-secondary" href={cancelHref}>
          <i className="bx bx-arrow-back me-1" aria-hidden="true" />
          Back
        </Link>
      </div>

      <form onSubmit={(ev) => void handleSubmit(ev)}>
        <div className="row g-4">
          <div className="col-lg-8">
            {error ? (
              <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
                <i className="bx bx-error-circle fs-5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {PERSONNEL_FORM_SECTIONS.map((section) => (
              <div className="card mb-4" key={section.id}>
                <div className="card-header d-flex align-items-center gap-3">
                  {section.icon ? (
                    <div className="avatar avatar-sm flex-shrink-0">
                      <span className="avatar-initial rounded bg-label-primary">
                        <i className={`bx ${section.icon}`} aria-hidden="true" />
                      </span>
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <h5 className="card-title mb-0">{section.title}</h5>
                    {section.description ? (
                      <small className="text-muted">{section.description}</small>
                    ) : null}
                  </div>
                </div>
                <div className="card-body">
                  {section.columns ? (
                    <div className="row g-4">
                      {section.columns.map((column) => (
                        <div className="col-md-6" key={column.id}>
                          <div className="border rounded p-3 h-100">
                            <h6 className="text-muted text-uppercase small mb-3">{column.title}</h6>
                            <div className="row g-3">
                              {column.fields.map((field) => renderField(field, true))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="row g-3">
                      {(section.fields ?? []).map((field) => renderField(field))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="col-lg-4">
            <div className="card ind-addperson-summary">
              <div className="card-header">
                <h5 className="card-title mb-0">Summary</h5>
              </div>
              <div className="card-body">
                <dl className="row mb-0 small">
                  {summaryRows.map((row) => (
                    <div
                      className="col-12 d-flex justify-content-between gap-3 py-2"
                      key={row.label}
                    >
                      <dt className="fw-normal text-muted mb-0">{row.label}</dt>
                      <dd className="fw-semibold text-end mb-0 text-break">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="card-footer d-flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary flex-grow-1" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <i className="bx bx-save me-1" aria-hidden="true" />
                      {submitLabel}
                    </>
                  )}
                </button>
                <Link className="btn btn-outline-secondary" href={cancelHref}>
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
