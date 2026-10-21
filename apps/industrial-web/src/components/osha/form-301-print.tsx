"use client";

import { autofillForm301FromForm300, displayEmployeeName, type OshaCase } from "@/lib/osha-module";
import {
  DOL_HEADER,
  FORM_301,
  OSHA_ATTENTION,
  OSHA_FORM_REVISION,
  OSHA_OMB,
} from "@/lib/osha-form-copy";

type Props = {
  caseRow: OshaCase;
};

function YesNo({ value }: { value: boolean | null }) {
  if (value === true) return <span>Yes</span>;
  if (value === false) return <span>No</span>;
  return <span>—</span>;
}

export function Form301Print({ caseRow }: Props) {
  const filled = autofillForm301FromForm300(caseRow);

  return (
    <div className="osha-form-facsimile osha-form-301" data-print-form="301">
      <header className="osha-form-facsimile__header">
        <div>
          <div className="osha-form-facsimile__form-id">
            {FORM_301.title} ({OSHA_FORM_REVISION})
          </div>
          <h1 className="osha-form-facsimile__title">{FORM_301.subtitle}</h1>
        </div>
        <div className="osha-form-facsimile__attention">
          <strong>Attention:</strong> {OSHA_ATTENTION}
        </div>
        <div className="osha-form-facsimile__dol">
          <div>{DOL_HEADER.agency}</div>
          <div>{DOL_HEADER.osha}</div>
          <div className="small">{OSHA_OMB}</div>
        </div>
      </header>

      <div className="osha-form-301__grid">
        <aside className="osha-form-301__left">
          {FORM_301.instructions.map((p) => (
            <p key={p.slice(0, 48)}>{p}</p>
          ))}
          <div className="osha-form-301__completed">
            <div>
              <strong>{FORM_301.completedBy}</strong>
              <div>{filled.completedBy || "—"}</div>
            </div>
            <div>
              <strong>Title</strong>
              <div>{filled.completedByTitle || "—"}</div>
            </div>
            <div>
              <strong>Phone</strong>
              <div>{filled.completedByPhone || "—"}</div>
            </div>
            <div>
              <strong>Date</strong>
              <div>{filled.completedByDate || "—"}</div>
            </div>
          </div>
        </aside>

        <section className="osha-form-301__middle">
          <h2>{FORM_301.informationAboutEmployee}</h2>
          <p>
            <strong>{FORM_301.fields.fullName}</strong>
            <br />
            {displayEmployeeName(filled)}
          </p>
          <p>
            <strong>{FORM_301.fields.street}</strong>
            <br />
            {filled.street || "—"}
          </p>
          <p>
            City {filled.city || "—"} State {filled.state || "—"} ZIP {filled.zip || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.dateOfBirth}</strong> {filled.dateOfBirth || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.dateHired}</strong> {filled.dateHired || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.gender}</strong>{" "}
            {filled.gender === "MALE"
              ? "Male"
              : filled.gender === "FEMALE"
                ? "Female"
                : "—"}
          </p>

          <h2>{FORM_301.informationAboutPhysician}</h2>
          <p>
            <strong>{FORM_301.fields.physician}</strong>
            <br />
            {filled.physicianName || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.treatmentAway}</strong>
            <br />
            Facility: {filled.treatmentFacility || "—"}
            <br />
            {filled.treatmentStreet || "—"}
            <br />
            City {filled.treatmentCity || "—"} State {filled.treatmentState || "—"} ZIP{" "}
            {filled.treatmentZip || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.emergencyRoom}</strong> <YesNo value={filled.treatedInEr} />
          </p>
          <p>
            <strong>{FORM_301.fields.hospitalized}</strong>{" "}
            <YesNo value={filled.hospitalizedOvernight} />
          </p>
        </section>

        <section className="osha-form-301__right">
          <h2>{FORM_301.informationAboutCase}</h2>
          <p>
            <strong>{FORM_301.fields.caseNumber}</strong> {filled.caseNumber || "—"}
            <br />
            <span className="small">{FORM_301.fields.caseNumberNote}</span>
          </p>
          <p>
            <strong>{FORM_301.fields.injuryDate}</strong> {filled.injuryDate || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.timeBeganWork}</strong> {filled.timeBeganWork || "—"}{" "}
            {filled.timeBeganWorkAmPm || ""}
          </p>
          <p>
            <strong>{FORM_301.fields.timeOfEvent}</strong>{" "}
            {filled.timeCannotBeDetermined
              ? FORM_301.fields.timeCannotBeDetermined
              : `${filled.timeOfEvent || "—"} ${filled.timeOfEventAmPm || ""}`}
          </p>
          <p>
            <strong>{FORM_301.fields.activityBefore}</strong>
            <br />
            <span className="small">{FORM_301.fields.activityBeforeHelp}</span>
            <br />
            {filled.activityBefore || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.whatHappened}</strong>
            <br />
            <span className="small">{FORM_301.fields.whatHappenedHelp}</span>
            <br />
            {filled.whatHappened || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.injuryOrIllness}</strong>
            <br />
            <span className="small">{FORM_301.fields.injuryOrIllnessHelp}</span>
            <br />
            {filled.injuryOrIllness || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.objectOrSubstance}</strong>
            <br />
            <span className="small">{FORM_301.fields.objectOrSubstanceHelp}</span>
            <br />
            {filled.objectOrSubstance || "—"}
          </p>
          <p>
            <strong>{FORM_301.fields.dateOfDeath}</strong> {filled.dateOfDeath || "—"}
          </p>
        </section>
      </div>

      <p className="osha-form-facsimile__burden">{FORM_301.publicBurden}</p>
    </div>
  );
}
