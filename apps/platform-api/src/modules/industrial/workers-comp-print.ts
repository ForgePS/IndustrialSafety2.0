/**
 * Printable HTML for workers' compensation claim packets
 * (claim + linked incident + status / restrictions / medical).
 */

import {
  accommodationsPayloadHasContent,
  summarizeWorkersCompAccommodationsPayload,
  type WorkersCompAccommodationsPayload,
} from "./wc-restrictions-accommodations.js";
import { incidentPrintDetailRows, escapeIncidentHtml } from "./incident-print.js";

export { escapeIncidentHtml };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function claimNumberFromCase(wc: Record<string, unknown>): string {
  const caseNumber = asText(wc.caseNumber);
  const summary = asRecord(wc.claimSummary);
  const fromSummary = summary ? asText(summary.claimNumber) : "";
  return caseNumber || fromSummary || "Pending";
}

function formatDate(value: unknown): string {
  const text = asText(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function metaGrid(rows: Array<{ label: string; value: string }>): string {
  const filtered = rows.filter((row) => row.value.trim() !== "");
  if (!filtered.length) return `<p class="muted">No detail fields recorded.</p>`;
  return `<div class="wc-print__meta">${filtered
    .map(
      (row) =>
        `<div><strong>${escapeIncidentHtml(row.label)}</strong><br/>${escapeIncidentHtml(row.value)}</div>`,
    )
    .join("")}</div>`;
}

function narrativeBlock(heading: string, body: string): string {
  const text = body.trim();
  if (!text) return "";
  return `<h2>${escapeIncidentHtml(heading)}</h2><p class="wc-print__narrative">${escapeIncidentHtml(text)}</p>`;
}

function claimDetailRows(wc: Record<string, unknown>): Array<{ label: string; value: string }> {
  const summary = asRecord(wc.claimSummary) ?? {};
  const daysAway = wc.daysAway;
  const restrictedDays = wc.restrictedDays;
  return [
    { label: "Claim #", value: claimNumberFromCase(wc) },
    { label: "Status", value: asText(wc.status) },
    { label: "Workflow stage", value: asText(wc.workflowStage) },
    { label: "Severity", value: asText(wc.severity) },
    { label: "Injured worker", value: asText(wc.workerName) },
    { label: "Date of birth", value: formatDate(wc.dateOfBirth) },
    { label: "Street", value: asText(wc.street) },
    { label: "City", value: asText(wc.city) },
    { label: "State", value: asText(wc.state) },
    { label: "ZIP", value: asText(wc.zip) },
    {
      label: "Sex",
      value:
        asText(wc.gender).toUpperCase() === "MALE"
          ? "Male"
          : asText(wc.gender).toUpperCase() === "FEMALE"
            ? "Female"
            : asText(wc.gender),
    },
    { label: "Date of injury", value: formatDate(summary.dateOfInjury) },
    { label: "Reported", value: formatDate(wc.reportedAt) },
    { label: "Location", value: asText(wc.locationText) },
    { label: "Carrier", value: asText(summary.carrierName) },
    { label: "Adjuster", value: asText(summary.adjuster) },
    { label: "Body parts", value: asText(summary.bodyParts) },
    {
      label: "Days away",
      value: daysAway == null || daysAway === "" ? "" : String(daysAway),
    },
    {
      label: "Restricted days",
      value: restrictedDays == null || restrictedDays === "" ? "" : String(restrictedDays),
    },
    { label: "Lost time start", value: formatDate(summary.lostTimeStart) },
    { label: "Lost time end", value: formatDate(summary.lostTimeEnd) },
  ];
}

function workStatusSection(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<h2>Work status</h2><p class="muted">No work status periods recorded.</p>`;
  }
  const blocks = items
    .map((item) => {
      const row = asRecord(item);
      if (!row) return "";
      const range = [formatDate(row.startDate), formatDate(row.endDate)].filter(Boolean).join(" – ");
      const notes = asText(row.notes);
      return `<div class="wc-print__block">
  <div><strong>${escapeIncidentHtml(asText(row.status) || "Status")}</strong>${
    range ? ` · ${escapeIncidentHtml(range)}` : ""
  }</div>
  ${notes ? `<p class="wc-print__narrative">${escapeIncidentHtml(notes)}</p>` : ""}
</div>`;
    })
    .filter(Boolean)
    .join("");
  return `<h2>Work status</h2>${blocks || `<p class="muted">No work status periods recorded.</p>`}`;
}

function restrictionsSection(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<h2>Restrictions / accommodations</h2><p class="muted">No restrictions recorded.</p>`;
  }
  const blocks = items
    .map((item) => {
      const row = asRecord(item);
      if (!row) return "";
      const range = [formatDate(row.startDate), formatDate(row.endDate)].filter(Boolean).join(" – ");
      const description = asText(row.description);
      const accommodations = row.accommodations as WorkersCompAccommodationsPayload | undefined;
      const accommodationSummary =
        accommodations && accommodationsPayloadHasContent(accommodations)
          ? summarizeWorkersCompAccommodationsPayload(accommodations)
          : "";
      return `<div class="wc-print__block">
  <div><strong>${escapeIncidentHtml(asText(row.status) || "Restriction")}</strong>${
    range ? ` · ${escapeIncidentHtml(range)}` : ""
  }</div>
  ${description ? `<p class="wc-print__narrative">${escapeIncidentHtml(description)}</p>` : ""}
  ${
    accommodationSummary
      ? `<p class="wc-print__narrative">${escapeIncidentHtml(accommodationSummary)}</p>`
      : ""
  }
</div>`;
    })
    .filter(Boolean)
    .join("");
  return `<h2>Restrictions / accommodations</h2>${
    blocks || `<p class="muted">No restrictions recorded.</p>`
  }`;
}

function medicalSection(wc: Record<string, unknown>): string {
  if (wc.medicalAllowed === false) {
    const reason =
      asText(wc.medicalDeniedReason) ||
      "Medical details are not available for your account on this claim.";
    return `<h2>Medical encounters</h2><p class="muted">${escapeIncidentHtml(reason)}</p>`;
  }
  const items = wc.medical;
  if (!Array.isArray(items) || items.length === 0) {
    return `<h2>Medical encounters</h2><p class="muted">No medical encounters recorded.</p>`;
  }
  const blocks = items
    .map((item) => {
      const row = asRecord(item);
      if (!row) return "";
      const detailRows = [
        { label: "Appointment", value: formatDate(row.appointmentDate) },
        { label: "Provider", value: asText(row.provider) },
        { label: "Specialty", value: asText(row.providerSpecialty) },
        { label: "Diagnosis", value: asText(row.diagnosis) },
        { label: "Treatment", value: asText(row.treatment) },
        { label: "Medication", value: asText(row.medication) },
        { label: "Symptoms", value: asText(row.symptoms) },
        { label: "Exam findings", value: asText(row.examFindings) },
        { label: "Assessment", value: asText(row.assessment) },
        { label: "Notes", value: asText(row.notes) },
      ].filter((r) => r.value);
      if (!detailRows.length) return "";
      return `<div class="wc-print__block">${detailRows
        .map(
          (r) =>
            `<div><strong>${escapeIncidentHtml(r.label)}</strong><br/>${escapeIncidentHtml(r.value)}</div>`,
        )
        .join("")}</div>`;
    })
    .filter(Boolean)
    .join("");
  return `<h2>Medical encounters</h2>${
    blocks || `<p class="muted">No medical encounters recorded.</p>`
  }`;
}

function incidentSection(incident: Record<string, unknown> | null | undefined): string {
  if (!incident) {
    return `<h2>Linked incident</h2><p class="muted">No incident is linked to this claim.</p>`;
  }
  const title =
    asText(incident.title) ||
    asText(incident.displayName) ||
    asText(incident.IncidentName) ||
    "Incident report";
  const description = asText(
    incident.description ||
      incident.IncidentDescription ||
      incident.WorkDayDetails ||
      incident.InjuryTypeDesc,
  );
  const corrective = asText(incident.workDayDetails || incident.WorkDayDetails);
  const showCorrective = Boolean(corrective) && corrective !== description;
  const details = incidentPrintDetailRows(incident);
  return `<h2>Linked incident</h2>
<p class="wc-print__incident-title">${escapeIncidentHtml(title)}</p>
${metaGrid(details)}
${description ? narrativeBlock("Description", description) : ""}
${showCorrective ? narrativeBlock("Immediate corrective action(s)", corrective) : ""}
${!description && !showCorrective ? `<p class="muted">No incident narrative was recorded.</p>` : ""}`;
}

export type WorkersCompPrintInput = {
  workersComp: Record<string, unknown>;
  incident?: Record<string, unknown> | null;
  branding?: { companyName?: string | null; logoUrl?: string | null };
};

/** Build self-contained printable HTML for a WC claim packet. */
export function buildWorkersCompPrintableHtml(input: WorkersCompPrintInput): string {
  const wc = input.workersComp;
  const branding = input.branding ?? {};
  const claimNumber = claimNumberFromCase(wc);
  const worker = asText(wc.workerName);
  const title = worker
    ? `Workers' Comp Claim — ${claimNumber} — ${worker}`
    : `Workers' Comp Claim — ${claimNumber}`;
  const company = asText(branding.companyName);
  const logo = asText(branding.logoUrl);
  const logoHtml = logo
    ? `<img class="wc-print__logo" src="${escapeIncidentHtml(logo)}" alt="" />`
    : "";
  const summary = asRecord(wc.claimSummary) ?? {};
  const claimNotes = asText(summary.notes);
  const caseNotes = asText(wc.notes);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${escapeIncidentHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  h2 { font-size: 1rem; margin: 24px 0 8px; border-bottom: 1px solid #d7dee8; padding-bottom: 4px; }
  .muted { color: #566a7f; font-size: 0.875rem; }
  .wc-print__toolbar { margin-bottom: 16px; }
  .wc-print__toolbar button {
    font: inherit; padding: 8px 14px; cursor: pointer;
    border: 1px solid #8592a3; border-radius: 6px; background: #fff;
  }
  .wc-print__head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .wc-print__logo { max-height: 48px; max-width: 160px; }
  .wc-print__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 16px; }
  .wc-print__narrative { white-space: pre-wrap; margin: 4px 0 0; }
  .wc-print__incident-title { font-weight: 600; margin: 0 0 8px; }
  .wc-print__block {
    border: 1px solid #d7dee8; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px;
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px;
  }
  .wc-print__block > div:first-child:last-child,
  .wc-print__block > .wc-print__narrative { grid-column: 1 / -1; }
  @media print {
    body { margin: 12px; }
    .no-print { display: none !important; }
  }
</style></head><body>
<p class="wc-print__toolbar no-print">
  <button type="button" onclick="window.print()">Print / Save as PDF</button>
</p>
<div class="wc-print__head">${logoHtml}<div>
  <h1>${escapeIncidentHtml(title)}</h1>
  <p class="muted">${escapeIncidentHtml(company || "Workers' compensation claim")}</p>
</div></div>
<h2>Claim overview</h2>
${metaGrid(claimDetailRows(wc))}
${claimNotes ? narrativeBlock("Claim notes", claimNotes) : ""}
${caseNotes && caseNotes !== claimNotes ? narrativeBlock("Case notes", caseNotes) : ""}
${incidentSection(input.incident)}
${workStatusSection(wc.workStatus)}
${restrictionsSection(wc.restrictions)}
${medicalSection(wc)}
</body></html>`;
}

export function workersCompPrintTitle(wc: Record<string, unknown>): string {
  const claimNumber = claimNumberFromCase(wc);
  const worker = asText(wc.workerName);
  return worker
    ? `Workers' Comp Claim — ${claimNumber} — ${worker}`
    : `Workers' Comp Claim — ${claimNumber}`;
}
