/**
 * Fill the official OSHA Form 300 (Rev. 04/2004) AcroForm PDF.
 * Template: /forms/osha-300.pdf (10 case rows per page).
 */

import { openOshaPdfForPrint } from "@/lib/osha-pdf-print";
import { PDFDocument, type PDFForm, type PDFRadioGroup } from "pdf-lib";
import {
  chunkForm300Pages,
  displayEmployeeName,
  form300PageTotals,
  formatOshaMonthDay,
  OSHA_FORM_300_ROWS_PER_PAGE,
  type OshaCase,
  type OshaCaseOutcome,
  type OshaIllnessCategory,
} from "@/lib/osha-module";

export const OSHA_FORM_300_PDF_PATH = "/forms/osha-300.pdf";
export { OSHA_FORM_300_ROWS_PER_PAGE, chunkForm300Pages };

export type Form300PdfHeader = {
  year: number;
  establishment: string;
  city?: string;
  state?: string;
};

const OUTCOME_RADIO: Record<OshaCaseOutcome, string> = {
  DEATH: "Death",
  DAYS_AWAY: "Days away from work",
  JOB_TRANSFER_RESTRICTION: "Job transfer or restriction",
  OTHER_RECORDABLE: "Other recordable cases",
};

const ILLNESS_RADIO: Record<OshaIllnessCategory, string> = {
  "1": "Injury",
  "2": "Skin Disorder",
  "3": "Respiratory Cond",
  "4": "Poisoning",
  "5": "Hearing Loss",
  "6": "All other",
};

function setText(form: PDFForm, name: string, value: string) {
  try {
    const field = form.getTextField(name);
    field.setText(value);
  } catch {
    // Field missing on variant templates — skip.
  }
}

function selectRadio(form: PDFForm, name: string, option: string | null) {
  if (!option) return;
  try {
    const group = form.getRadioGroup(name) as PDFRadioGroup;
    if (group.getOptions().includes(option)) {
      group.select(option);
    }
  } catch {
    // Field missing — skip.
  }
}

function clearRow(form: PDFForm, row: number) {
  setText(form, `Case No. ${row}`, "");
  setText(form, `Employee's Name ${row}`, "");
  setText(form, `Job Title ${row}`, "");
  setText(form, `Date of injury or Illness month ${row}`, "");
  setText(form, `Date of injury or illness day ${row}`, "");
  setText(form, `Where the Event Occurred ${row}`, "");
  setText(form, `Injury or Illness Description ${row}`, "");
  setText(form, `Number of days injured or ill away from work ${row}`, "");
  setText(form, `On job transfer or restriction ${row}`, "");
}

function fillRow(form: PDFForm, row: number, caseRow: OshaCase) {
  const md = formatOshaMonthDay(caseRow.injuryDate);
  const [month = "", day = ""] = md.includes("/") ? md.split("/") : ["", ""];

  setText(form, `Case No. ${row}`, caseRow.caseNumber || String(row));
  setText(
    form,
    `Employee's Name ${row}`,
    displayEmployeeName(caseRow) === "—" ? "" : displayEmployeeName(caseRow),
  );
  setText(form, `Job Title ${row}`, caseRow.jobTitle);
  setText(form, `Date of injury or Illness month ${row}`, month);
  setText(form, `Date of injury or illness day ${row}`, day);
  setText(form, `Where the Event Occurred ${row}`, caseRow.eventLocation);
  setText(form, `Injury or Illness Description ${row}`, caseRow.description);
  setText(
    form,
    `Number of days injured or ill away from work ${row}`,
    caseRow.daysAway != null ? String(caseRow.daysAway) : "",
  );
  setText(
    form,
    `On job transfer or restriction ${row}`,
    caseRow.restrictedDays != null ? String(caseRow.restrictedDays) : "",
  );

  if (caseRow.caseOutcome) {
    selectRadio(form, `Group${row}`, OUTCOME_RADIO[caseRow.caseOutcome]);
  }
  if (caseRow.illnessCategory) {
    selectRadio(form, `Group${row}a`, ILLNESS_RADIO[caseRow.illnessCategory]);
  }
}

function fillHeader(form: PDFForm, header: Form300PdfHeader) {
  const yearShort = String(header.year).slice(-2);
  setText(form, "Log of Injury/Illness Year", yearShort);
  setText(form, "Log of Injury/Illness Establishment name", header.establishment);
  setText(form, "Log of Injury/Illness City", header.city ?? "");
  setText(form, "Log of Injury/Illness State", header.state ?? "");
}

function fillPageTotals(form: PDFForm, pageCases: OshaCase[]) {
  const totals = form300PageTotals(pageCases);
  setText(form, "Death Total", String(totals.deaths));
  setText(form, "Days away from work Total", String(totals.daysAwayCases));
  setText(form, "Job transfer or restriction Total", String(totals.jobTransferCases));
  setText(form, "Other recordable cases Total", String(totals.otherRecordableCases));
  setText(form, "Number of days injured or ill away from work Total", String(totals.daysAway));
  setText(form, "On job transfer or restriction Total", String(totals.restrictedDays));
  setText(form, "Injury Total", String(totals.m1));
  setText(form, "Skin Disorder Total", String(totals.m2));
  setText(form, "Respiratory Cond Total", String(totals.m3));
  setText(form, "Poisoning Total", String(totals.m4));
  setText(form, "Hearling Loss Total", String(totals.m5));
  setText(form, "All other Total", String(totals.m6));
}

async function fillSinglePage(
  templateBytes: ArrayBuffer,
  header: Form300PdfHeader,
  pageCases: OshaCase[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();
  fillHeader(form, header);

  for (let i = 1; i <= OSHA_FORM_300_ROWS_PER_PAGE; i += 1) {
    clearRow(form, i);
    const caseRow = pageCases[i - 1];
    if (caseRow) fillRow(form, i, caseRow);
  }

  fillPageTotals(form, pageCases);

  // Flatten so print shows values on the official form artwork.
  form.flatten();
  return doc.save();
}

/** Build a filled multi-page OSHA Form 300 PDF (one official form page per 10 cases). */
export async function buildForm300Pdf(
  templateBytes: ArrayBuffer,
  header: Form300PdfHeader,
  cases: OshaCase[],
): Promise<Uint8Array> {
  const pages = chunkForm300Pages(cases);
  const out = await PDFDocument.create();

  for (const pageCases of pages) {
    const filled = await fillSinglePage(templateBytes, header, pageCases);
    const pageDoc = await PDFDocument.load(filled);
    const copied = await out.copyPages(pageDoc, pageDoc.getPageIndices());
    for (const page of copied) out.addPage(page);
  }

  return out.save();
}

export async function fetchForm300Template(path = OSHA_FORM_300_PDF_PATH): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Could not load OSHA Form 300 template (${res.status}).`);
  }
  return res.arrayBuffer();
}

/** Open the filled PDF in a new window and trigger print. */
export function openForm300PdfForPrint(pdfBytes: Uint8Array, filename: string): string | null {
  return openOshaPdfForPrint(pdfBytes, filename, "osha-form-300");
}
