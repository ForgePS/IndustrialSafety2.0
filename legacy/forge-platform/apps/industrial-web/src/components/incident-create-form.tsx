"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BodyPartMultiSelect } from "@/components/body-part-multi-select";
import { IncidentBodyMap } from "@/components/incident-body-map";
import { MedicalRefusalAcknowledgmentForm } from "@/components/medical-refusal-acknowledgment-form";
import { ReasonableSuspicionForm } from "@/components/reasonable-suspicion-form";
import { DrugAlcoholConsentList } from "@/components/drug-alcohol-incident-form";
import { useBodyRegions } from "@/hooks/use-body-regions";
import { bodyLocationSummaryLabel, toggleBodyLocation } from "@/lib/incident-body-map";
import { medicalRefusalValidationMessage } from "@/lib/medical-refusal-acknowledgment";
import { reasonableSuspicionValidationMessage } from "@/lib/reasonable-suspicion";
import { drugAlcoholConsentsValidationMessage } from "@/lib/drug-alcohol-incident";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { PersonnelSearchField } from "@/components/personnel-search-field";
import {
  EMPTY_ASSIGNMENT_OPTIONS,
  type AssignmentOptions,
  type DepartmentOption,
} from "@/lib/personnel-assignment";
import {
  EMPTY_LOOKUPS,
  loadAssignmentOptions,
  loadPersonnelLookups,
  resolveLookupLabel,
  type LookupState,
} from "@/lib/personnel-lookups";
import { fetchAllPersonnelRows } from "@/lib/personnel-roster-fetch";
import { personNameDisplay } from "@/lib/person-name-display";
import { isSafetyOrEhsStaffPerson, safetyOrEhsDepartmentIds } from "@/lib/task-assignees";
import {
  applyPersonnelLinkToIncidentForm,
  emptyIncidentCreateForm,
  INCIDENT_SEVERITY_OPTIONS,
  INCIDENT_STATUS_OPTIONS,
  INJURY_TYPE_OPTIONS,
  incidentTabLabel,
  incidentRecordToCreateFormState,
  joinIncidentDateOccurred,
  resolveIncidentTitleLocation,
  splitIncidentDateOccurred,
  suggestIncidentTitle,
  type IncidentCategory,
  type IncidentCreateFormState,
  type IncidentRecord,
} from "@/lib/incidents-module";

type EhsStaffCandidate = {
  id: string;
  displayName: string;
  jobTitle: string;
  departmentName: string;
  divisionName: string;
  departmentId: string;
};

type EhsStaffOption = {
  id: string;
  displayName: string;
  jobTitle: string;
  departmentName: string;
  divisionName: string;
};

type Props = {
  category: IncidentCategory;
  tenantId: string;
  tenantName: string;
  defaultReporter: string;
  mode?: "create" | "edit";
  initialIncident?: IncidentRecord;
  saving: boolean;
  error: string | null;
  /** When true, show Continue to Workers Comp (injuries/automotive + manage WC). */
  canContinueToWorkersComp?: boolean;
  /** When true, show Continue to OSHA (injuries/automotive + manage OSHA). */
  canContinueToOsha?: boolean;
  onCancel: () => void;
  onSubmit: (
    form: IncidentCreateFormState,
    bodyLocations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) => Promise<void>;
  /** Save incident and open WC claim below without closing the report. */
  onContinueToWorkersComp?: (
    form: IncidentCreateFormState,
    bodyLocations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) => Promise<void>;
  /** Save incident and open OSHA Form 300/301 below (no WC claim required). */
  onContinueToOsha?: (
    form: IncidentCreateFormState,
    bodyLocations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) => Promise<void>;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="incidents-create__section">
      <div className="incidents-create__section-head">
        <h6 className="incidents-create__section-title">{title}</h6>
        {description ? <p className="incidents-create__section-desc">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  children,
  className = "col-md-6",
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {hint ? <div className="form-text">{hint}</div> : null}
    </div>
  );
}

/** Production-ready new incident report form with org context and injury body map. */
export function IncidentCreateForm({
  category,
  tenantId,
  tenantName: _tenantName,
  defaultReporter,
  mode = "create",
  initialIncident,
  saving,
  error,
  canContinueToWorkersComp = false,
  canContinueToOsha = false,
  onCancel,
  onSubmit,
  onContinueToWorkersComp,
  onContinueToOsha,
}: Props) {
  const { regions } = useBodyRegions();
  const [form, setForm] = useState<IncidentCreateFormState>(() =>
    emptyIncidentCreateForm(defaultReporter),
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [bodyLocations, setBodyLocations] = useState<string[]>([]);
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [assignment, setAssignment] = useState<AssignmentOptions>(EMPTY_ASSIGNMENT_OPTIONS);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [ehsCandidates, setEhsCandidates] = useState<EhsStaffCandidate[]>([]);

  const showWorkersComp = category === "injuries" || category === "automotive";

  useEffect(() => {
    if (mode === "edit" && initialIncident) {
      setForm(incidentRecordToCreateFormState(initialIncident, defaultReporter));
      setBodyLocations(initialIncident.bodyLocations ?? []);
      setTitleTouched(Boolean(initialIncident.title.trim()));
      return;
    }
    const empty = emptyIncidentCreateForm(defaultReporter);
    setForm(
      category === "drug-alcohol"
        ? {
            ...empty,
            reasonableSuspicion: { ...empty.reasonableSuspicion, observedAt: empty.dateOccurred },
          }
        : empty,
    );
    setBodyLocations([]);
    setTitleTouched(false);
  }, [category, defaultReporter, mode, initialIncident]);

  useEffect(() => {
    if (mode !== "edit" || !initialIncident || lookupsLoading) return;
    if (initialIncident.departmentId || !initialIncident.departmentName.trim()) return;
    const match = lookups.departments.find(
      (dept) =>
        dept.label.trim().toLowerCase() === initialIncident.departmentName.trim().toLowerCase(),
    );
    if (!match) return;
    setForm((prev) => (prev.departmentId ? prev : { ...prev, departmentId: match.id }));
  }, [mode, initialIncident, lookups.departments, lookupsLoading]);

  useEffect(() => {
    let cancelled = false;
    setLookupsLoading(true);
    void (async () => {
      const [catalog, assign] = await Promise.all([
        loadPersonnelLookups(tenantId),
        loadAssignmentOptions(),
      ]);
      if (cancelled) return;
      setLookups(catalog);
      setAssignment(assign);
      setLookupsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!showWorkersComp) {
      setEhsCandidates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const roster = await fetchAllPersonnelRows({
          query: { sort: "lastName" },
        });
        if (cancelled) return;
        setEhsCandidates(
          roster.people.map((person) => ({
            id: person.id,
            displayName: person.displayName,
            jobTitle: person.jobTitle,
            departmentName: person.departmentName,
            divisionName: person.divisionName,
            departmentId: person.departmentId,
          })),
        );
      } catch {
        if (!cancelled) setEhsCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showWorkersComp, tenantId]);

  const ehsDepartmentIds = useMemo(
    () => safetyOrEhsDepartmentIds(lookups.departments),
    [lookups.departments],
  );

  const ehsStaff = useMemo((): EhsStaffOption[] => {
    const deptLabelById = new Map(
      lookups.departments.map((dept) => [dept.id, dept.label] as const),
    );
    return ehsCandidates
      .map((person) => {
        const resolvedDepartment =
          person.departmentName.trim() ||
          (person.departmentId ? (deptLabelById.get(person.departmentId) ?? "") : "");
        return {
          id: person.id,
          displayName: person.displayName,
          jobTitle: person.jobTitle,
          departmentName: resolvedDepartment,
          divisionName: person.divisionName,
          departmentId: person.departmentId,
        };
      })
      .filter((person) => isSafetyOrEhsStaffPerson(person, ehsDepartmentIds))
      .map(({ departmentId: _departmentId, ...option }) => option)
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
      );
  }, [ehsCandidates, lookups.departments, ehsDepartmentIds]);

  const completedByStaffId = useMemo(() => {
    const name = form.completedBy.trim().toLowerCase();
    if (!name) return "";
    return ehsStaff.find((person) => person.displayName.trim().toLowerCase() === name)?.id ?? "";
  }, [form.completedBy, ehsStaff]);

  const completedByOrphan = useMemo(() => {
    const name = form.completedBy.trim();
    if (!name || completedByStaffId) return "";
    return name;
  }, [form.completedBy, completedByStaffId]);

  const siteLabel = form.siteId ? resolveLookupLabel(lookups, "sites", form.siteId) : undefined;
  const departmentLabel = form.departmentId
    ? resolveLookupLabel(lookups, "departments", form.departmentId)
    : undefined;

  const titleLocation = resolveIncidentTitleLocation(form, {
    ...(siteLabel ? { siteLabel } : {}),
    ...(departmentLabel ? { departmentLabel } : {}),
  });
  const suggestedTitle = suggestIncidentTitle({
    dateOccurred: form.dateOccurred,
    personAffected: form.personAffected,
    location: titleLocation,
  });
  const occurredParts = splitIncidentDateOccurred(form.dateOccurred);

  useEffect(() => {
    if (titleTouched) return;
    setForm((prev) => (prev.title === suggestedTitle ? prev : { ...prev, title: suggestedTitle }));
  }, [suggestedTitle, titleTouched]);

  const bodyPartSelectionCount = bodyLocations.length;

  function onBodyMapToggle(regionId: string) {
    setBodyLocations((prev) => toggleBodyLocation(prev, regionId, regions));
  }

  function clearBodyLocations() {
    setBodyLocations([]);
  }

  function validateIncidentForm(): string | null {
    if (category === "medical-refusals") {
      const refusalMessage = medicalRefusalValidationMessage(form.medicalRefusalAcknowledgment);
      if (refusalMessage) return refusalMessage;
    }
    if (category === "drug-alcohol") {
      if (!form.personAffected.trim()) return "Select or enter the employee being tested.";
      const suspicionMessage = reasonableSuspicionValidationMessage(form.reasonableSuspicion);
      if (suspicionMessage) return suspicionMessage;
      if (form.drugAlcoholConsents.length === 0) {
        return "Add a drug & alcohol consent form for the employee being tested.";
      }
    }
    return drugAlcoholConsentsValidationMessage(form.drugAlcoholConsents);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const title = form.title.trim() || suggestedTitle;
    if (!title) return;
    const formError = validateIncidentForm();
    if (formError) {
      setValidationError(formError);
      return;
    }
    setValidationError(null);
    await onSubmit({ ...form, title }, bodyLocations, {
      ...(siteLabel ? { siteLabel } : {}),
      ...(departmentLabel ? { departmentLabel } : {}),
    });
  }

  async function handleContinueToWorkersComp() {
    if (!onContinueToWorkersComp) return;
    if (!form.workersCompRelevant) {
      setValidationError(
        "Check “Workers' compensation relevant” before continuing to the WC report.",
      );
      return;
    }
    const title = form.title.trim() || suggestedTitle;
    if (!title) {
      setValidationError("Enter a report title or person affected.");
      return;
    }
    const formError = validateIncidentForm();
    if (formError) {
      setValidationError(formError);
      return;
    }
    setValidationError(null);
    await onContinueToWorkersComp({ ...form, title, workersCompRelevant: true }, bodyLocations, {
      ...(siteLabel ? { siteLabel } : {}),
      ...(departmentLabel ? { departmentLabel } : {}),
    });
  }

  async function handleContinueToOsha() {
    if (!onContinueToOsha) return;
    const title = form.title.trim() || suggestedTitle;
    if (!title) {
      setValidationError("Enter a report title or person affected.");
      return;
    }
    const formError = validateIncidentForm();
    if (formError) {
      setValidationError(formError);
      return;
    }
    setValidationError(null);
    await onContinueToOsha({ ...form, title }, bodyLocations, {
      ...(siteLabel ? { siteLabel } : {}),
      ...(departmentLabel ? { departmentLabel } : {}),
    });
  }

  const isEdit = mode === "edit";
  const showContinueToWc =
    showWorkersComp &&
    form.workersCompRelevant &&
    canContinueToWorkersComp &&
    Boolean(onContinueToWorkersComp);
  const showContinueToOsha = showWorkersComp && canContinueToOsha && Boolean(onContinueToOsha);

  return (
    <div className="card incidents-create mb-4" id="incident-create-form">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h5 className="card-title mb-0">
            {isEdit ? "Edit" : "New"} {incidentTabLabel(category)} report
          </h5>
          <p className="text-muted small mb-0 mt-1">
            {isEdit
              ? "Update report details. Required fields are marked."
              : "Capture what happened, who was involved, and where — required fields are marked."}
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="card-body">
        {error || validationError ? (
          <div className="alert alert-danger" role="alert">
            {error || validationError}
          </div>
        ) : null}

        <form className="incidents-create__form" onSubmit={(ev) => void handleSubmit(ev)}>
          <Section
            title="Organization"
            description="Select location first, then division, then department. Area / zone is optional."
          >
            <div className="row g-3">
              <OrgLocationCascade
                idPrefix="incident"
                required
                loading={lookupsLoading}
                sites={lookups.sites}
                departments={lookups.departments as DepartmentOption[]}
                divisionEntries={assignment.divisionEntries}
                value={{
                  siteId: form.siteId,
                  siteName: siteLabel ?? form.location,
                  divisionName: form.division,
                  departmentId: form.departmentId,
                  departmentName: departmentLabel ?? "",
                }}
                onChange={(next) =>
                  setForm((prev) => ({
                    ...prev,
                    siteId: next.siteId,
                    location: next.siteName || prev.location,
                    division: next.divisionName,
                    departmentId: next.departmentId,
                  }))
                }
              />
              <Field
                id="incident-zone"
                label="Area / zone"
                hint="Specific area within the department (e.g. Shipping, Line 2)."
                className="col-md-4"
              >
                <input
                  id="incident-zone"
                  className="form-control"
                  placeholder="Shipping, dock, office…"
                  value={form.community}
                  onChange={(ev) => setForm((prev) => ({ ...prev, community: ev.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="People involved">
            <div className="row g-3">
              <div className="col-md-6">
                <PersonnelSearchField
                  id="incident-person"
                  label={category === "drug-alcohol" ? "Employee being tested" : "Person affected"}
                  required={category === "injuries" || category === "drug-alcohol"}
                  hint="Search Employee Profiles by last name or EMPLOYEE #. Visitors can be typed as free text."
                  personnelId={form.personnelId}
                  displayName={form.personAffected}
                  allowUnlinkedText
                  onLinkedChange={(selection) =>
                    setForm((prev) => {
                      if (!selection) return applyPersonnelLinkToIncidentForm(prev, null);
                      const siteId = selection.siteId.trim();
                      const siteLabel =
                        (siteId ? resolveLookupLabel(lookups, "sites", siteId) : "") ||
                        selection.siteLabel;
                      return applyPersonnelLinkToIncidentForm(prev, {
                        personnelId: selection.personnelId,
                        displayName: selection.displayName,
                        siteId,
                        siteLabel,
                        divisionName: selection.divisionName,
                        departmentId: selection.departmentId,
                        hireDate: selection.hireDate,
                        dateOfBirth: selection.dateOfBirth,
                      });
                    })
                  }
                  onUnlinkedTextChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      personnelId: "",
                      personAffected: value,
                    }))
                  }
                />
              </div>
              <Field
                id="incident-hire-date"
                label="Hire date"
                hint="Filled from the employee profile when linked."
                className="col-md-3"
              >
                <input
                  id="incident-hire-date"
                  type="date"
                  className="form-control"
                  value={form.hireDate}
                  onChange={(ev) => setForm((prev) => ({ ...prev, hireDate: ev.target.value }))}
                />
              </Field>
              <Field
                id="incident-date-of-birth"
                label="Date of birth"
                hint="Filled from the employee profile when linked."
                className="col-md-3"
              >
                <input
                  id="incident-date-of-birth"
                  type="date"
                  className="form-control"
                  value={form.dateOfBirth}
                  onChange={(ev) => setForm((prev) => ({ ...prev, dateOfBirth: ev.target.value }))}
                />
              </Field>
              <Field
                id="incident-shift-start"
                label="Shift start time"
                hint="Time the employee began work (OSHA Form 301)."
                className="col-md-3"
              >
                <input
                  id="incident-shift-start"
                  type="time"
                  className="form-control"
                  value={form.shiftStartTime}
                  onChange={(ev) =>
                    setForm((prev) => ({ ...prev, shiftStartTime: ev.target.value }))
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Incident details">
            <div className="row g-3">
              <Field
                id="incident-title"
                label="Report title"
                {...(titleTouched
                  ? {}
                  : { hint: "Updates from date, person, and location until you edit it." })}
                className="col-md-6"
              >
                <input
                  id="incident-title"
                  className="form-control"
                  placeholder={suggestedTitle}
                  value={form.title}
                  onChange={(ev) => {
                    setTitleTouched(true);
                    setForm((prev) => ({ ...prev, title: ev.target.value }));
                  }}
                />
              </Field>
              <Field id="incident-date" label="Date occurred" className="col-md-3">
                <input
                  id="incident-date"
                  type="date"
                  className="form-control"
                  value={occurredParts.date}
                  onChange={(ev) =>
                    setForm((prev) => ({
                      ...prev,
                      dateOccurred: joinIncidentDateOccurred(
                        ev.target.value,
                        splitIncidentDateOccurred(prev.dateOccurred).time,
                      ),
                    }))
                  }
                />
              </Field>
              <Field id="incident-time" label="Time occurred" className="col-md-3">
                <input
                  id="incident-time"
                  type="time"
                  className="form-control"
                  value={occurredParts.time}
                  onChange={(ev) =>
                    setForm((prev) => ({
                      ...prev,
                      dateOccurred: joinIncidentDateOccurred(
                        splitIncidentDateOccurred(prev.dateOccurred).date,
                        ev.target.value,
                      ),
                    }))
                  }
                />
              </Field>
              {category === "injuries" ? (
                <Field id="incident-type" label="Injury type" className="col-md-4">
                  <select
                    id="incident-type"
                    className="form-select"
                    value={form.incidentTypeName}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, incidentTypeName: ev.target.value }))
                    }
                  >
                    <option value="">Injury Type</option>
                    {INJURY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {form.incidentTypeName &&
                    !(INJURY_TYPE_OPTIONS as readonly string[]).includes(form.incidentTypeName) ? (
                      <option value={form.incidentTypeName}>{form.incidentTypeName}</option>
                    ) : null}
                  </select>
                </Field>
              ) : (
                <Field id="incident-type" label="Incident type" className="col-md-4">
                  <input
                    id="incident-type"
                    className="form-control"
                    placeholder={incidentTabLabel(category)}
                    value={form.incidentTypeName}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, incidentTypeName: ev.target.value }))
                    }
                  />
                </Field>
              )}
              <Field id="incident-status" label="Status" className="col-md-4">
                <select
                  id="incident-status"
                  className="form-select"
                  value={form.status}
                  onChange={(ev) => setForm((prev) => ({ ...prev, status: ev.target.value }))}
                >
                  {INCIDENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="incident-severity" label="Severity" className="col-md-4">
                <select
                  id="incident-severity"
                  className="form-select"
                  value={form.severity}
                  onChange={(ev) => setForm((prev) => ({ ...prev, severity: ev.target.value }))}
                >
                  {INCIDENT_SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              {category !== "injuries" ? (
                <>
                  <Field
                    id="incident-location-detail"
                    label="Location detail"
                    hint="Specific spot within the site."
                    className="col-md-6"
                  >
                    <input
                      id="incident-location-detail"
                      className="form-control"
                      placeholder="Building, bay, equipment ID…"
                      value={form.locationDetail}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, locationDetail: ev.target.value }))
                      }
                    />
                  </Field>
                  <Field id="incident-location" label="Location" className="col-md-6">
                    <input
                      id="incident-location"
                      className="form-control"
                      value={form.location}
                      onChange={(ev) => setForm((prev) => ({ ...prev, location: ev.target.value }))}
                    />
                  </Field>
                </>
              ) : null}
            </div>
          </Section>

          {category === "injuries" ? (
            <Section
              title="Injury location"
              description="Choose one or more body parts from the list or click the matching areas on the body map."
            >
              <div className="row g-3 mb-3">
                <Field
                  id="incident-body-part"
                  label="Location"
                  hint="Select multiple body parts. Choices stay in sync with the body map below."
                  className="col-md-6"
                >
                  <BodyPartMultiSelect
                    id="incident-body-part"
                    regions={regions}
                    selected={bodyLocations}
                    onToggle={onBodyMapToggle}
                    onClear={clearBodyLocations}
                    disabled={saving}
                  />
                </Field>
                <Field
                  id="incident-location-detail"
                  label="Scene detail"
                  hint="Where in the facility the injury occurred (optional)."
                  className="col-md-6"
                >
                  <input
                    id="incident-location-detail"
                    className="form-control"
                    placeholder="Dock 3, line 2, office…"
                    value={form.locationDetail}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, locationDetail: ev.target.value }))
                    }
                  />
                </Field>
              </div>
              <IncidentBodyMap mode="select" selected={bodyLocations} onToggle={onBodyMapToggle} />
              <p className="text-muted small mt-3 mb-0">
                {bodyPartSelectionCount > 0 ? (
                  <>
                    <span className="fw-semibold text-body">Selected:</span>{" "}
                    {bodyLocationSummaryLabel(bodyLocations, regions)}
                  </>
                ) : (
                  "No body part selected yet. Use the Location menu or click the body map."
                )}
              </p>
            </Section>
          ) : null}

          <Section title="What happened">
            <div className="row g-3">
              <Field id="incident-description" label="Description" className="col-12">
                <textarea
                  id="incident-description"
                  className="form-control incidents-create__textarea"
                  rows={4}
                  placeholder="What happened? Include equipment, tasks, and environmental factors."
                  value={form.description}
                  onChange={(ev) => setForm((prev) => ({ ...prev, description: ev.target.value }))}
                />
              </Field>
              <Field
                id="incident-corrective"
                label="Immediate corrective action(s)"
                className="col-12"
              >
                <textarea
                  id="incident-corrective"
                  className="form-control incidents-create__textarea"
                  rows={3}
                  placeholder="What was done right away to address the hazard or injury?"
                  value={form.correctiveActions}
                  onChange={(ev) =>
                    setForm((prev) => ({ ...prev, correctiveActions: ev.target.value }))
                  }
                />
              </Field>
            </div>
          </Section>

          {showWorkersComp ? (
            <Section
              title="Information about the physician or other health care professional"
              description="OSHA Form 301 questions 6–9. These carry forward to the OSHA case when the incident is recordable."
            >
              <div className="row g-3">
                <Field
                  id="incident-physician"
                  label="6) Name of physician or other health care professional"
                  className="col-12"
                >
                  <input
                    id="incident-physician"
                    className="form-control"
                    value={form.physicianName}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, physicianName: ev.target.value }))
                    }
                  />
                </Field>
                <div className="col-12">
                  <p className="form-label mb-2">
                    7) If treatment was given away from the worksite, where was it given?
                  </p>
                </div>
                <Field id="incident-treatment-facility" label="Facility" className="col-md-6">
                  <input
                    id="incident-treatment-facility"
                    className="form-control"
                    value={form.treatmentFacility}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, treatmentFacility: ev.target.value }))
                    }
                  />
                </Field>
                <Field id="incident-treatment-street" label="Street" className="col-md-6">
                  <input
                    id="incident-treatment-street"
                    className="form-control"
                    value={form.treatmentStreet}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, treatmentStreet: ev.target.value }))
                    }
                  />
                </Field>
                <Field id="incident-treatment-city" label="City" className="col-md-4">
                  <input
                    id="incident-treatment-city"
                    className="form-control"
                    value={form.treatmentCity}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, treatmentCity: ev.target.value }))
                    }
                  />
                </Field>
                <Field id="incident-treatment-state" label="State" className="col-md-4">
                  <input
                    id="incident-treatment-state"
                    className="form-control"
                    value={form.treatmentState}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, treatmentState: ev.target.value }))
                    }
                  />
                </Field>
                <Field id="incident-treatment-zip" label="ZIP" className="col-md-4">
                  <input
                    id="incident-treatment-zip"
                    className="form-control"
                    value={form.treatmentZip}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, treatmentZip: ev.target.value }))
                    }
                  />
                </Field>
                <div className="col-md-6">
                  <span className="form-label d-block">
                    8) Was employee treated in an emergency room?
                  </span>
                  <div className="d-flex flex-wrap gap-3 mt-1">
                    {(
                      [
                        { value: true, label: "Yes" },
                        { value: false, label: "No" },
                      ] as const
                    ).map((opt) => (
                      <label key={`er-${opt.label}`} className="form-check form-check-inline mb-0">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="incident-treated-er"
                          checked={form.treatedInEr === opt.value}
                          onChange={() => setForm((prev) => ({ ...prev, treatedInEr: opt.value }))}
                        />
                        <span className="form-check-label">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-md-6">
                  <span className="form-label d-block">
                    9) Was employee hospitalized overnight as an in-patient?
                  </span>
                  <div className="d-flex flex-wrap gap-3 mt-1">
                    {(
                      [
                        { value: true, label: "Yes" },
                        { value: false, label: "No" },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={`hosp-${opt.label}`}
                        className="form-check form-check-inline mb-0"
                      >
                        <input
                          type="radio"
                          className="form-check-input"
                          name="incident-hospitalized"
                          checked={form.hospitalizedOvernight === opt.value}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              hospitalizedOvernight: opt.value,
                            }))
                          }
                        />
                        <span className="form-check-label">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          <Section
            title="Completed by"
            description={
              showWorkersComp
                ? "Reporter, witnesses, and OSHA Form 301 header fields. Completed-by values autofill onto the Form 301 case."
                : "Who reported the incident and any witnesses."
            }
          >
            <div className="row g-3">
              <Field
                id="incident-reported-by"
                label="Reported by"
                className={showWorkersComp ? "col-md-3" : "col-md-6"}
              >
                <input
                  id="incident-reported-by"
                  className="form-control"
                  value={form.reportedBy}
                  onChange={(ev) => setForm((prev) => ({ ...prev, reportedBy: ev.target.value }))}
                />
              </Field>
              {showWorkersComp ? (
                <>
                  <Field id="incident-reported-title" label="Title" className="col-md-3">
                    <input
                      id="incident-reported-title"
                      className="form-control"
                      value={form.reportedByTitle}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, reportedByTitle: ev.target.value }))
                      }
                    />
                  </Field>
                  <Field id="incident-reported-phone" label="Phone" className="col-md-3">
                    <input
                      id="incident-reported-phone"
                      className="form-control"
                      value={form.reportedByPhone}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, reportedByPhone: ev.target.value }))
                      }
                    />
                  </Field>
                  <Field id="incident-reported-date" label="Date" className="col-md-3">
                    <input
                      id="incident-reported-date"
                      type="date"
                      className="form-control"
                      value={form.reportedByDate}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, reportedByDate: ev.target.value }))
                      }
                    />
                  </Field>
                  <div className="w-100" />
                  <Field id="incident-completed-by" label="Completed by" className="col-md-4">
                    <select
                      id="incident-completed-by"
                      className="form-select"
                      value={completedByStaffId || (completedByOrphan ? "__orphan__" : "")}
                      onChange={(ev) => {
                        const value = ev.target.value;
                        if (!value) {
                          setForm((prev) => ({
                            ...prev,
                            completedBy: "",
                            completedByTitle: "",
                          }));
                          return;
                        }
                        if (value === "__orphan__") return;
                        const person = ehsStaff.find((row) => row.id === value);
                        if (!person) return;
                        setForm((prev) => ({
                          ...prev,
                          completedBy: person.displayName,
                          completedByTitle: person.jobTitle,
                        }));
                      }}
                    >
                      <option value="">Select EHS staff…</option>
                      {completedByOrphan ? (
                        <option value="__orphan__">{personNameDisplay(completedByOrphan)}</option>
                      ) : null}
                      {ehsStaff.map((person) => (
                        <option key={person.id} value={person.id}>
                          {personNameDisplay(person.displayName)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="incident-completed-title" label="Title" className="col-md-4">
                    <input
                      id="incident-completed-title"
                      className="form-control"
                      value={form.completedByTitle}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, completedByTitle: ev.target.value }))
                      }
                    />
                  </Field>
                  <Field id="incident-completed-date" label="Date" className="col-md-4">
                    <input
                      id="incident-completed-date"
                      type="date"
                      className="form-control"
                      value={form.completedByDate}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, completedByDate: ev.target.value }))
                      }
                    />
                  </Field>
                </>
              ) : null}
              <Field
                id="incident-witnesses"
                label="Witness name(s)"
                hint="Separate multiple witnesses with commas."
                className={showWorkersComp ? "col-md-12" : "col-md-6"}
              >
                <input
                  id="incident-witnesses"
                  className="form-control"
                  placeholder="Optional"
                  value={form.witnessNames}
                  onChange={(ev) => setForm((prev) => ({ ...prev, witnessNames: ev.target.value }))}
                />
              </Field>
            </div>
          </Section>

          {showWorkersComp ? (
            <Section
              title="Workers' compensation"
              description="Flag when this incident may require a workers' comp claim. OSHA recordkeeping is separate and does not require a WC claim."
            >
              <div className="row g-3 align-items-start">
                <div className="col-md-6">
                  <div className="form-check">
                    <input
                      id="incident-wc-relevant"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.workersCompRelevant}
                      onChange={(ev) =>
                        setForm((prev) => ({
                          ...prev,
                          workersCompRelevant: ev.target.checked,
                        }))
                      }
                    />
                    <label className="form-check-label" htmlFor="incident-wc-relevant">
                      Workers&apos; compensation relevant
                    </label>
                  </div>
                </div>
                {form.workersCompRelevant ? (
                  <Field id="incident-wc-notes" label="WC notes" className="col-md-6">
                    <textarea
                      id="incident-wc-notes"
                      className="form-control incidents-create__textarea"
                      rows={2}
                      value={form.workersCompNotes}
                      onChange={(ev) =>
                        setForm((prev) => ({ ...prev, workersCompNotes: ev.target.value }))
                      }
                    />
                  </Field>
                ) : null}
              </div>
            </Section>
          ) : null}

          {category === "drug-alcohol" ? (
            <Section
              title="Reasonable suspicion observation"
              description="Supervisor documentation of the specific signs observed, removal from duty, and transportation."
            >
              <ReasonableSuspicionForm
                value={form.reasonableSuspicion}
                disabled={saving}
                onChange={(reasonableSuspicion) => {
                  setValidationError(null);
                  setForm((prev) => ({ ...prev, reasonableSuspicion }));
                }}
              />
            </Section>
          ) : null}

          <Section
            title="Drug & alcohol consent and test"
            description={
              category === "drug-alcohol"
                ? "Employee consent, test type, collection, and results for the reasonable-suspicion test."
                : "Document post-accident or other required drug and/or alcohol testing, employee consent, and collection status. Add a separate consent form for each employee involved."
            }
          >
            <DrugAlcoholConsentList
              value={form.drugAlcoholConsents}
              disabled={saving}
              defaultReason={category === "drug-alcohol" ? "reasonable-suspicion" : "post-accident"}
              defaultEmployee={{
                employeeName: form.personAffected,
                personnelId: form.personnelId,
              }}
              onChange={(drugAlcoholConsents) => {
                setValidationError(null);
                setForm((prev) => ({ ...prev, drugAlcoholConsents }));
              }}
            />
          </Section>

          {category === "medical-refusals" ? (
            <Section
              title="Medical Evaluation / Treatment Refusal Acknowledgment"
              description="Document the services offered, the employee's decision, and required acknowledgments and signatures."
            >
              <MedicalRefusalAcknowledgmentForm
                value={form.medicalRefusalAcknowledgment}
                disabled={saving}
                onChange={(medicalRefusalAcknowledgment) => {
                  setValidationError(null);
                  setForm((prev) => ({ ...prev, medicalRefusalAcknowledgment }));
                }}
              />
            </Section>
          ) : null}

          <div className="incidents-create__actions d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Submitting…"
                : isEdit
                  ? "Save & Close"
                  : "Submit & Close"}
            </button>
            {showContinueToWc ? (
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={saving}
                onClick={() => void handleContinueToWorkersComp()}
              >
                {saving ? "Saving…" : "Continue to Workers Comp report"}
              </button>
            ) : null}
            {showContinueToOsha ? (
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={saving}
                onClick={() => void handleContinueToOsha()}
                title="Open OSHA Form 300/301 for this incident without requiring a workers' compensation claim"
              >
                {saving ? "Saving…" : "Continue to OSHA report"}
              </button>
            ) : null}
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
