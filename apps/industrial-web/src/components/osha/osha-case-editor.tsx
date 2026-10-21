"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  OSHA_AM_PM,
  OSHA_CASE_OUTCOMES,
  OSHA_GENDERS,
  OSHA_ILLNESS_CATEGORIES,
  autofillForm301FromForm300,
  caseOutcomeLabel,
  illnessCategoryLabel,
  recordabilityLabel,
  type OshaAmPm,
  type OshaCase,
  type OshaCaseOutcome,
  type OshaGender,
  type OshaIllnessCategory,
  type OshaRecordability,
} from "@/lib/osha-module";
import { FORM_300, FORM_301, OSHA_ATTENTION } from "@/lib/osha-form-copy";

export type OshaCaseEditorSave = Partial<OshaCase> & {
  recordabilityStatus?: OshaRecordability;
};

type Props = {
  caseRow: OshaCase;
  canManage: boolean;
  saving: boolean;
  printing301?: boolean;
  onSave: (body: OshaCaseEditorSave) => Promise<void>;
  onClose: () => void;
  onPrint301: () => void;
};

function Field({
  id,
  label,
  children,
  className = "",
}: {
  id?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`form-label d-block ${className}`} htmlFor={id}>
      <span className="small text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function OshaCaseEditor({
  caseRow,
  canManage,
  saving,
  printing301 = false,
  onSave,
  onClose,
  onPrint301,
}: Props) {
  const [tab, setTab] = useState<"300" | "301" | "recordability">("300");
  const [draft, setDraft] = useState<OshaCase>(caseRow);

  useEffect(() => {
    setDraft(caseRow);
  }, [caseRow]);

  function openTab(next: "300" | "301" | "recordability") {
    if (next === "301") {
      // Transfer Form 300 log fields into empty Form 301 fields (case #, DOI, narratives).
      setDraft((prev) => autofillForm301FromForm300(prev));
    }
    setTab(next);
  }

  function set<K extends keyof OshaCase>(key: K, value: OshaCase[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    await onSave({
      caseNumber: draft.caseNumber,
      employeeName: draft.employeeName,
      jobTitle: draft.jobTitle,
      injuryDate: draft.injuryDate,
      eventLocation: draft.eventLocation,
      description: draft.description,
      caseOutcome: draft.caseOutcome,
      daysAway: draft.daysAway,
      restrictedDays: draft.restrictedDays,
      illnessCategory: draft.illnessCategory,
      establishment: draft.establishment,
      recordabilityStatus: draft.recordabilityStatus,
      completedBy: draft.completedBy,
      completedByTitle: draft.completedByTitle,
      completedByPhone: draft.completedByPhone,
      completedByDate: draft.completedByDate,
      street: draft.street,
      city: draft.city,
      state: draft.state,
      zip: draft.zip,
      dateOfBirth: draft.dateOfBirth,
      dateHired: draft.dateHired,
      gender: draft.gender,
      physicianName: draft.physicianName,
      treatmentFacility: draft.treatmentFacility,
      treatmentStreet: draft.treatmentStreet,
      treatmentCity: draft.treatmentCity,
      treatmentState: draft.treatmentState,
      treatmentZip: draft.treatmentZip,
      treatedInEr: draft.treatedInEr,
      hospitalizedOvernight: draft.hospitalizedOvernight,
      timeBeganWork: draft.timeBeganWork,
      timeBeganWorkAmPm: draft.timeBeganWorkAmPm,
      timeOfEvent: draft.timeOfEvent,
      timeOfEventAmPm: draft.timeOfEventAmPm,
      timeCannotBeDetermined: draft.timeCannotBeDetermined,
      activityBefore: draft.activityBefore,
      whatHappened: draft.whatHappened,
      injuryOrIllness: draft.injuryOrIllness,
      objectOrSubstance: draft.objectOrSubstance,
      dateOfDeath: draft.dateOfDeath,
    });
  }

  return (
    <div className="card osha-case-editor mb-4">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h3 className="h5 mb-0">OSHA case — {draft.title}</h3>
          <p className="small text-muted mb-0 mt-1">{OSHA_ATTENTION}</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onPrint301}
            disabled={printing301}
          >
            {printing301 ? "Preparing Form 301…" : "Print Form 301"}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="card-body">
        <ul className="nav nav-tabs mb-3" role="tablist">
          {(
            [
              ["300", "Form 300 (Log)"],
              ["301", "Form 301 (Incident report)"],
              ["recordability", "Recordability"],
            ] as const
          ).map(([id, label]) => (
            <li className="nav-item" key={id}>
              <button
                type="button"
                className={`nav-link ${tab === id ? "active" : ""}`}
                onClick={() => openTab(id)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={onSubmit}>
          {tab === "300" ? (
            <div className="osha-case-editor__section">
              <h4 className="h6">{FORM_300.steps[1]}</h4>
              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <Field id="osha-case-number" label={FORM_300.columns.A}>
                    <input
                      id="osha-case-number"
                      className="form-control"
                      value={draft.caseNumber}
                      disabled={!canManage}
                      onChange={(ev) => set("caseNumber", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-5">
                  <Field id="osha-employee" label={FORM_300.columns.B}>
                    <input
                      id="osha-employee"
                      className="form-control"
                      value={draft.employeeName}
                      disabled={!canManage}
                      onChange={(ev) => set("employeeName", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="osha-job" label={FORM_300.columns.C}>
                    <input
                      id="osha-job"
                      className="form-control"
                      value={draft.jobTitle}
                      disabled={!canManage}
                      onChange={(ev) => set("jobTitle", ev.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <h4 className="h6">{FORM_300.steps[2]}</h4>
              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <Field id="osha-injury-date" label={FORM_300.columns.D}>
                    <input
                      id="osha-injury-date"
                      type="date"
                      className="form-control"
                      value={draft.injuryDate ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("injuryDate", ev.target.value || null)}
                    />
                  </Field>
                </div>
                <div className="col-md-9">
                  <Field id="osha-location" label={FORM_300.columns.E}>
                    <input
                      id="osha-location"
                      className="form-control"
                      value={draft.eventLocation}
                      disabled={!canManage}
                      onChange={(ev) => set("eventLocation", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-12">
                  <Field id="osha-desc" label={FORM_300.columns.F}>
                    <textarea
                      id="osha-desc"
                      className="form-control"
                      rows={3}
                      value={draft.description}
                      disabled={!canManage}
                      onChange={(ev) => set("description", ev.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <h4 className="h6">{FORM_300.steps[3]}</h4>
              <p className="small text-muted">{FORM_300.classifyNote}</p>
              <div className="d-flex flex-wrap gap-3 mb-3">
                {OSHA_CASE_OUTCOMES.map((outcome) => (
                  <label key={outcome} className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="caseOutcome"
                      checked={draft.caseOutcome === outcome}
                      disabled={!canManage}
                      onChange={() => set("caseOutcome", outcome as OshaCaseOutcome)}
                    />
                    <span className="form-check-label">
                      {caseOutcomeLabel(outcome)}
                    </span>
                  </label>
                ))}
                <label className="form-check">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="caseOutcome"
                    checked={draft.caseOutcome == null}
                    disabled={!canManage}
                    onChange={() => set("caseOutcome", null)}
                  />
                  <span className="form-check-label">None selected</span>
                </label>
              </div>

              <h4 className="h6">{FORM_300.steps[4]}</h4>
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <Field id="osha-days-away" label={`${FORM_300.columns.K} (days)`}>
                    <input
                      id="osha-days-away"
                      type="number"
                      min={0}
                      className="form-control"
                      value={draft.daysAway ?? ""}
                      disabled={!canManage}
                      onChange={(ev) =>
                        set("daysAway", ev.target.value === "" ? null : Number(ev.target.value))
                      }
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="osha-days-restricted" label={`${FORM_300.columns.L} (days)`}>
                    <input
                      id="osha-days-restricted"
                      type="number"
                      min={0}
                      className="form-control"
                      value={draft.restrictedDays ?? ""}
                      disabled={!canManage}
                      onChange={(ev) =>
                        set(
                          "restrictedDays",
                          ev.target.value === "" ? null : Number(ev.target.value),
                        )
                      }
                    />
                  </Field>
                </div>
              </div>

              <h4 className="h6">{FORM_300.steps[5]}</h4>
              <div className="d-flex flex-wrap gap-3 mb-3">
                {OSHA_ILLNESS_CATEGORIES.map((cat) => (
                  <label key={cat} className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="illnessCategory"
                      checked={draft.illnessCategory === cat}
                      disabled={!canManage}
                      onChange={() => set("illnessCategory", cat as OshaIllnessCategory)}
                    />
                    <span className="form-check-label">{illnessCategoryLabel(cat)}</span>
                  </label>
                ))}
                <label className="form-check">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="illnessCategory"
                    checked={draft.illnessCategory == null}
                    disabled={!canManage}
                    onChange={() => set("illnessCategory", null)}
                  />
                  <span className="form-check-label">None selected</span>
                </label>
              </div>
            </div>
          ) : null}

          {tab === "301" ? (
            <div className="osha-case-editor__section">
              <p className="small text-muted mb-3">
                Linked to Form 300 case no. <strong>{draft.caseNumber || "—"}</strong>. Empty fields
                below are autofilled from the Form 300 log (employee, date, description, location).
                Print uses the official OSHA Form 301 PDF.
              </p>
              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <Field id="osha-completed-by" label={FORM_301.completedBy}>
                    <input
                      id="osha-completed-by"
                      className="form-control"
                      value={draft.completedBy}
                      disabled={!canManage}
                      onChange={(ev) => set("completedBy", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field id="osha-completed-title" label="Title">
                    <input
                      id="osha-completed-title"
                      className="form-control"
                      value={draft.completedByTitle}
                      disabled={!canManage}
                      onChange={(ev) => set("completedByTitle", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field id="osha-completed-phone" label="Phone">
                    <input
                      id="osha-completed-phone"
                      className="form-control"
                      value={draft.completedByPhone}
                      disabled={!canManage}
                      onChange={(ev) => set("completedByPhone", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field id="osha-completed-date" label="Date">
                    <input
                      id="osha-completed-date"
                      type="date"
                      className="form-control"
                      value={draft.completedByDate ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("completedByDate", ev.target.value || null)}
                    />
                  </Field>
                </div>
              </div>

              <h4 className="h6">{FORM_301.informationAboutEmployee}</h4>
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <Field id="f301-name" label={FORM_301.fields.fullName}>
                    <input
                      id="f301-name"
                      className="form-control"
                      value={draft.employeeName}
                      disabled={!canManage}
                      onChange={(ev) => set("employeeName", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-6">
                  <Field id="f301-street" label={FORM_301.fields.street}>
                    <input
                      id="f301-street"
                      className="form-control"
                      value={draft.street}
                      disabled={!canManage}
                      onChange={(ev) => set("street", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="f301-city" label="City">
                    <input
                      id="f301-city"
                      className="form-control"
                      value={draft.city}
                      disabled={!canManage}
                      onChange={(ev) => set("city", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-2">
                  <Field id="f301-state" label="State">
                    <input
                      id="f301-state"
                      className="form-control"
                      value={draft.state}
                      disabled={!canManage}
                      onChange={(ev) => set("state", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-2">
                  <Field id="f301-zip" label="ZIP">
                    <input
                      id="f301-zip"
                      className="form-control"
                      value={draft.zip}
                      disabled={!canManage}
                      onChange={(ev) => set("zip", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="f301-dob" label={FORM_301.fields.dateOfBirth}>
                    <input
                      id="f301-dob"
                      type="date"
                      className="form-control"
                      value={draft.dateOfBirth ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("dateOfBirth", ev.target.value || null)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="f301-hired" label={FORM_301.fields.dateHired}>
                    <input
                      id="f301-hired"
                      type="date"
                      className="form-control"
                      value={draft.dateHired ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("dateHired", ev.target.value || null)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <span className="small text-muted d-block">{FORM_301.fields.gender}</span>
                  <div className="d-flex gap-3 mt-2">
                    {OSHA_GENDERS.map((g) => (
                      <label key={g} className="form-check">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="gender"
                          checked={draft.gender === g}
                          disabled={!canManage}
                          onChange={() => set("gender", g as OshaGender)}
                        />
                        <span className="form-check-label">
                          {g === "MALE" ? "Male" : "Female"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <h4 className="h6">{FORM_301.informationAboutPhysician}</h4>
              <div className="row g-3 mb-3">
                <div className="col-12">
                  <Field id="f301-physician" label={FORM_301.fields.physician}>
                    <input
                      id="f301-physician"
                      className="form-control"
                      value={draft.physicianName}
                      disabled={!canManage}
                      onChange={(ev) => set("physicianName", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-6">
                  <Field id="f301-facility" label={`${FORM_301.fields.treatmentAway} — Facility`}>
                    <input
                      id="f301-facility"
                      className="form-control"
                      value={draft.treatmentFacility}
                      disabled={!canManage}
                      onChange={(ev) => set("treatmentFacility", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-6">
                  <Field id="f301-tstreet" label="Street">
                    <input
                      id="f301-tstreet"
                      className="form-control"
                      value={draft.treatmentStreet}
                      disabled={!canManage}
                      onChange={(ev) => set("treatmentStreet", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-4">
                  <Field id="f301-tcity" label="City">
                    <input
                      id="f301-tcity"
                      className="form-control"
                      value={draft.treatmentCity}
                      disabled={!canManage}
                      onChange={(ev) => set("treatmentCity", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-2">
                  <Field id="f301-tstate" label="State">
                    <input
                      id="f301-tstate"
                      className="form-control"
                      value={draft.treatmentState}
                      disabled={!canManage}
                      onChange={(ev) => set("treatmentState", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-2">
                  <Field id="f301-tzip" label="ZIP">
                    <input
                      id="f301-tzip"
                      className="form-control"
                      value={draft.treatmentZip}
                      disabled={!canManage}
                      onChange={(ev) => set("treatmentZip", ev.target.value)}
                    />
                  </Field>
                </div>
                <div className="col-md-6">
                  <span className="small text-muted d-block">{FORM_301.fields.emergencyRoom}</span>
                  <div className="d-flex gap-3 mt-2">
                    {[true, false].map((v) => (
                      <label key={String(v)} className="form-check">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="treatedInEr"
                          checked={draft.treatedInEr === v}
                          disabled={!canManage}
                          onChange={() => set("treatedInEr", v)}
                        />
                        <span className="form-check-label">{v ? "Yes" : "No"}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-md-6">
                  <span className="small text-muted d-block">{FORM_301.fields.hospitalized}</span>
                  <div className="d-flex gap-3 mt-2">
                    {[true, false].map((v) => (
                      <label key={String(v)} className="form-check">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="hospitalizedOvernight"
                          checked={draft.hospitalizedOvernight === v}
                          disabled={!canManage}
                          onChange={() => set("hospitalizedOvernight", v)}
                        />
                        <span className="form-check-label">{v ? "Yes" : "No"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <h4 className="h6">{FORM_301.informationAboutCase}</h4>
              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <Field id="f301-case" label={FORM_301.fields.caseNumber}>
                    <input
                      id="f301-case"
                      className="form-control"
                      value={draft.caseNumber}
                      disabled={!canManage}
                      onChange={(ev) => set("caseNumber", ev.target.value)}
                    />
                  </Field>
                  <p className="small text-muted mb-0">{FORM_301.fields.caseNumberNote}</p>
                </div>
                <div className="col-md-3">
                  <Field id="f301-injury" label={FORM_301.fields.injuryDate}>
                    <input
                      id="f301-injury"
                      type="date"
                      className="form-control"
                      value={draft.injuryDate ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("injuryDate", ev.target.value || null)}
                    />
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field id="f301-began" label={FORM_301.fields.timeBeganWork}>
                    <div className="input-group">
                      <input
                        id="f301-began"
                        className="form-control"
                        placeholder="HH:MM"
                        value={draft.timeBeganWork}
                        disabled={!canManage}
                        onChange={(ev) => set("timeBeganWork", ev.target.value)}
                      />
                      <select
                        className="form-select"
                        style={{ maxWidth: "5rem" }}
                        value={draft.timeBeganWorkAmPm ?? ""}
                        disabled={!canManage}
                        onChange={(ev) =>
                          set(
                            "timeBeganWorkAmPm",
                            (ev.target.value || null) as OshaAmPm | null,
                          )
                        }
                      >
                        <option value="">—</option>
                        {OSHA_AM_PM.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field id="f301-event-time" label={FORM_301.fields.timeOfEvent}>
                    <div className="input-group">
                      <input
                        id="f301-event-time"
                        className="form-control"
                        placeholder="HH:MM"
                        value={draft.timeOfEvent}
                        disabled={!canManage || draft.timeCannotBeDetermined}
                        onChange={(ev) => set("timeOfEvent", ev.target.value)}
                      />
                      <select
                        className="form-select"
                        style={{ maxWidth: "5rem" }}
                        value={draft.timeOfEventAmPm ?? ""}
                        disabled={!canManage || draft.timeCannotBeDetermined}
                        onChange={(ev) =>
                          set("timeOfEventAmPm", (ev.target.value || null) as OshaAmPm | null)
                        }
                      >
                        <option value="">—</option>
                        {OSHA_AM_PM.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <label className="form-check mt-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={draft.timeCannotBeDetermined}
                      disabled={!canManage}
                      onChange={(ev) => set("timeCannotBeDetermined", ev.target.checked)}
                    />
                    <span className="form-check-label">{FORM_301.fields.timeCannotBeDetermined}</span>
                  </label>
                </div>
                {(
                  [
                    ["activityBefore", "activityBefore", "activityBeforeHelp"],
                    ["whatHappened", "whatHappened", "whatHappenedHelp"],
                    ["injuryOrIllness", "injuryOrIllness", "injuryOrIllnessHelp"],
                    ["objectOrSubstance", "objectOrSubstance", "objectOrSubstanceHelp"],
                  ] as const
                ).map(([key, field, help]) => (
                  <div className="col-12" key={key}>
                    <Field id={`f301-${key}`} label={FORM_301.fields[field]}>
                      <textarea
                        id={`f301-${key}`}
                        className="form-control"
                        rows={3}
                        value={draft[key]}
                        disabled={!canManage}
                        onChange={(ev) => set(key, ev.target.value)}
                      />
                    </Field>
                    <p className="small text-muted">{FORM_301.fields[help]}</p>
                  </div>
                ))}
                <div className="col-md-4">
                  <Field id="f301-death" label={FORM_301.fields.dateOfDeath}>
                    <input
                      id="f301-death"
                      type="date"
                      className="form-control"
                      value={draft.dateOfDeath ?? ""}
                      disabled={!canManage}
                      onChange={(ev) => set("dateOfDeath", ev.target.value || null)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "recordability" ? (
            <div className="osha-case-editor__section">
              <p className="text-muted">
                Recordability is never automatic — an authorized reviewer must decide. Only
                Recordable and Privacy case rows appear on Forms 300 and 300A.
              </p>
              <div className="d-flex flex-wrap gap-3 mb-3">
                {(
                  ["PENDING", "RECORDABLE", "NOT_RECORDABLE", "PRIVACY_CASE"] as OshaRecordability[]
                ).map((status) => (
                  <label key={status} className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="recordability"
                      checked={draft.recordabilityStatus === status}
                      disabled={!canManage}
                      onChange={() => set("recordabilityStatus", status)}
                    />
                    <span className="form-check-label">{recordabilityLabel(status)}</span>
                  </label>
                ))}
              </div>
              <Field id="osha-establishment" label="Establishment">
                <input
                  id="osha-establishment"
                  className="form-control"
                  value={draft.establishment}
                  disabled={!canManage}
                  onChange={(ev) => set("establishment", ev.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {canManage ? (
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save case"}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
