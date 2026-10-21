/**
 * Fill the official OSHA Form 301 (Rev. 04/2004) AcroForm PDF.
 * Template: /forms/osha-301.pdf
 * Linked to Form 300 via case number (field 10) and shared case fields.
 */

import { PDFDocument, type PDFForm, type PDFRadioGroup } from "pdf-lib";
import {
  autofillForm301FromForm300,
  displayEmployeeName,
  formatOshaDateMdY,
  type OshaCase,
} from "@/lib/osha-module";
import { openOshaPdfForPrint } from "@/lib/osha-pdf-print";

export const OSHA_FORM_301_PDF_PATH = "/forms/osha-301.pdf";

function setText(form: PDFForm, name: string, value: string) {
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Field missing on variant templates — skip.
  }
}

function selectRadio(form: PDFForm, name: string, option: string | null) {
  if (!option) return;
  try {
    const group = form.getRadioGroup(name) as PDFRadioGroup;
    if (group.getOptions().includes(option)) group.select(option);
  } catch {
    // Field missing — skip.
  }
}

function fillForm301(form: PDFForm, caseRow: OshaCase) {
  const filled = autofillForm301FromForm300(caseRow);
  const employee =
    displayEmployeeName(filled) === "—" ? "" : displayEmployeeName(filled);

  setText(form, "301 Completed by", filled.completedBy);
  setText(form, "301 Title", filled.completedByTitle);
  setText(form, "301 Phone", filled.completedByPhone);
  setText(form, "301 Date", formatOshaDateMdY(filled.completedByDate));

  setText(form, "301 Full name", employee);
  setText(form, "301 Address Street", filled.street);
  setText(form, "301 Address City", filled.city);
  setText(form, "301 Address State", filled.state);
  setText(form, "301 Address Zip", filled.zip);
  setText(form, "301 DOB", formatOshaDateMdY(filled.dateOfBirth));
  setText(form, "301 Date Hired", formatOshaDateMdY(filled.dateHired));
  if (filled.gender === "MALE") selectRadio(form, "301 Gender", "Male");
  if (filled.gender === "FEMALE") selectRadio(form, "301 Gender", "Female");

  setText(form, "301 Name of Doctor", filled.physicianName);
  setText(form, "301 Facility Name", filled.treatmentFacility);
  setText(form, "301 Facility Address Street", filled.treatmentStreet);
  setText(form, "301 Facility Address City", filled.treatmentCity);
  setText(form, "301 Facility Address State", filled.treatmentState);
  setText(form, "301 Facility Address Zip", filled.treatmentZip);
  if (filled.treatedInEr === true) selectRadio(form, "301 ER", "Yes");
  if (filled.treatedInEr === false) selectRadio(form, "301 ER", "No");
  if (filled.hospitalizedOvernight === true) selectRadio(form, "301 Hospitalized", "Yes");
  if (filled.hospitalizedOvernight === false) selectRadio(form, "301 Hospitalized", "No");

  // Field 10 — transfer case number from Form 300 Log (column A).
  setText(form, "301 Case Number", filled.caseNumber);
  setText(form, "301 Date of Injury or Illness", formatOshaDateMdY(filled.injuryDate));
  setText(form, "301 Time employee began work", filled.timeBeganWork);
  if (filled.timeBeganWorkAmPm === "AM") {
    selectRadio(form, "301 Time Employee Began Work AMPM", "AM");
  } else if (filled.timeBeganWorkAmPm === "PM") {
    selectRadio(form, "301 Time Employee Began Work AMPM", "PM");
  }

  setText(form, "301 Time of event", filled.timeCannotBeDetermined ? "" : filled.timeOfEvent);
  if (filled.timeCannotBeDetermined) {
    selectRadio(form, "301 Time of Event AMPM", "Unsure");
  } else if (filled.timeOfEventAmPm === "AM") {
    selectRadio(form, "301 Time of Event AMPM", "AM");
  } else if (filled.timeOfEventAmPm === "PM") {
    selectRadio(form, "301 Time of Event AMPM", "PM");
  }

  setText(form, "301 Activity Prior to Event", filled.activityBefore);
  setText(form, "301 What Happened", filled.whatHappened);
  setText(form, "301 Describe Injury or Illness", filled.injuryOrIllness);
  setText(form, "301 What Harmed Employee", filled.objectOrSubstance);
  setText(form, "301 Death Date", formatOshaDateMdY(filled.dateOfDeath));
}

/** Build a filled OSHA Form 301 PDF for one Form 300 log case. */
export async function buildForm301Pdf(
  templateBytes: ArrayBuffer,
  caseRow: OshaCase,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();
  fillForm301(form, caseRow);
  form.flatten();
  return doc.save();
}

/** Build one Form 301 page per Form 300 log case (linked by case number). */
export async function buildForm301PdfForCases(
  templateBytes: ArrayBuffer,
  cases: OshaCase[],
): Promise<Uint8Array> {
  if (cases.length === 0) {
    return buildForm301Pdf(templateBytes, {
      id: "",
      title: "",
      status: "",
      incidentId: "",
      employeeName: "",
      injuryDate: null,
      recordabilityStatus: "PENDING",
      oshaRecordable: null,
      privacyCase: false,
      reviewer: "",
      establishment: "",
      calendarYear: null,
      daysAway: null,
      restrictedDays: null,
      jobTitle: "",
      description: "",
      caseNumber: "",
      eventLocation: "",
      caseOutcome: null,
      illnessCategory: null,
      completedBy: "",
      completedByTitle: "",
      completedByPhone: "",
      completedByDate: null,
      street: "",
      city: "",
      state: "",
      zip: "",
      dateOfBirth: null,
      dateHired: null,
      gender: null,
      physicianName: "",
      treatmentFacility: "",
      treatmentStreet: "",
      treatmentCity: "",
      treatmentState: "",
      treatmentZip: "",
      treatedInEr: null,
      hospitalizedOvernight: null,
      timeBeganWork: "",
      timeBeganWorkAmPm: null,
      timeOfEvent: "",
      timeOfEventAmPm: null,
      timeCannotBeDetermined: false,
      activityBefore: "",
      whatHappened: "",
      injuryOrIllness: "",
      objectOrSubstance: "",
      dateOfDeath: null,
      siteId: null,
      personnelId: null,
    });
  }

  const out = await PDFDocument.create();
  for (const caseRow of cases) {
    const filled = await buildForm301Pdf(templateBytes, caseRow);
    const pageDoc = await PDFDocument.load(filled);
    const copied = await out.copyPages(pageDoc, pageDoc.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  return out.save();
}

export async function fetchForm301Template(path = OSHA_FORM_301_PDF_PATH): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Could not load OSHA Form 301 template (${res.status}).`);
  }
  return res.arrayBuffer();
}

export function openForm301PdfForPrint(pdfBytes: Uint8Array, filename: string): string | null {
  return openOshaPdfForPrint(pdfBytes, filename, "osha-form-301");
}
