/**
 * Printable HTML for an incident's root cause analysis (5 Why) report.
 */
import { escapeIncidentHtml as esc } from "./incident-print.js";

export type RcaPrintAction = { action: string; assignedTo: string; dueDate: string; status: string };

export type RcaPrintData = {
  incidentSummary: string;
  immediateActions: string;
  contributingFactors: string[];
  rootCause: string;
  fiveWhys: string[];
  fiveWhyQuestions: string[];
  correctiveActions: RcaPrintAction[];
  conductedBy: string;
  conductedAt: string;
  participantsInvolved: string[];
  eventDate: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

/** Tolerates partial / legacy RCA payloads; empty rows are dropped. */
export function normalizeRcaForPrint(raw: unknown): RcaPrintData {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const whys = Array.isArray(obj.fiveWhys) ? obj.fiveWhys.map(text) : [];
  const questions = Array.isArray(obj.fiveWhyQuestions) ? obj.fiveWhyQuestions.map(text) : [];
  const actions = Array.isArray(obj.correctiveActions) ? obj.correctiveActions : [];
  return {
    incidentSummary: text(obj.incidentSummary),
    immediateActions: text(obj.immediateActions),
    contributingFactors: textList(obj.contributingFactors),
    rootCause: text(obj.rootCause),
    fiveWhys: whys,
    fiveWhyQuestions: questions,
    correctiveActions: actions
      .map((a) => {
        const row = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
        return {
          action: text(row.action),
          assignedTo: text(row.assignedTo),
          dueDate: text(row.dueDate),
          status: text(row.status),
        };
      })
      .filter((a) => a.action),
    conductedBy: text(obj.conductedBy),
    conductedAt: text(obj.conductedAt),
    participantsInvolved: textList(obj.participantsInvolved),
    eventDate: text(obj.eventDate),
  };
}

/** `YYYY-MM-DD…` → `MM/DD/YYYY`; anything else is returned as-is. */
export function formatRcaDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : value.trim();
}

const ACTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  in_progress: "In progress",
  complete: "Complete",
  completed: "Complete",
};

function actionStatusLabel(status: string): string {
  return ACTION_STATUS_LABELS[status.toLowerCase()] ?? (status || "Pending");
}

function paragraph(value: string, empty = "Not recorded."): string {
  return value
    ? `<p class="rca__text">${esc(value)}</p>`
    : `<p class="rca__text rca__muted">${esc(empty)}</p>`;
}

export function buildRcaPrintableHtml(input: {
  incident: Record<string, unknown>;
  rca: RcaPrintData;
  branding?: { companyName?: string | null; logoUrl?: string | null };
  generatedAt?: Date;
}): string {
  const { incident, rca } = input;
  const company = text(input.branding?.companyName);
  const logo = text(input.branding?.logoUrl);
  const incidentTitle = text(incident.title) || "Incident";
  const generated = (input.generatedAt ?? new Date()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const reference: Array<[string, string]> = [
    ["Incident", incidentTitle],
    ["Event date", formatRcaDate(rca.eventDate || text(incident.dateOccurred))],
    ["Incident type", text(incident.incidentTypeName) || text(incident.category)],
    ["Person affected", text(incident.personAffected)],
    ["Location", [text(incident.location), text(incident.departmentName)].filter(Boolean).join(" · ")],
    ["Incident status", text(incident.status)],
    ["Analysis conducted by", rca.conductedBy],
    ["Analysis date", formatRcaDate(rca.conductedAt)],
  ];
  const referenceHtml = reference
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span class="rca__label">${esc(k)}</span><span>${esc(v)}</span></div>`)
    .join("");

  const team = rca.participantsInvolved;
  const teamHtml = team.length
    ? `<ul class="rca__list">${team.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : `<p class="rca__text rca__muted">No team members listed.</p>`;

  const factorsHtml = rca.contributingFactors.length
    ? `<ul class="rca__list">${rca.contributingFactors.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : `<p class="rca__text rca__muted">None recorded.</p>`;

  const whyRows = Array.from({ length: Math.max(rca.fiveWhys.length, rca.fiveWhyQuestions.length) }, (_, i) => ({
    n: i + 1,
    q: rca.fiveWhyQuestions[i] ?? "",
    a: rca.fiveWhys[i] ?? "",
  })).filter((r) => r.q || r.a);
  const whysHtml = whyRows.length
    ? `<table class="rca__table"><thead><tr><th style="width:56px">Why</th><th style="width:38%">Question</th><th>Answer</th></tr></thead><tbody>${whyRows
        .map(
          (r) =>
            `<tr><td class="rca__num">${r.n}</td><td>${esc(r.q) || "&mdash;"}</td><td>${esc(r.a) || "&mdash;"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="rca__text rca__muted">The 5 Why analysis has not been completed.</p>`;

  const actionsHtml = rca.correctiveActions.length
    ? `<table class="rca__table"><thead><tr><th style="width:32px">#</th><th>Corrective / preventive action</th><th style="width:20%">Assigned to</th><th style="width:14%">Due date</th><th style="width:14%">Status</th></tr></thead><tbody>${rca.correctiveActions
        .map(
          (a, i) =>
            `<tr><td class="rca__num">${i + 1}</td><td>${esc(a.action)}</td><td>${esc(a.assignedTo) || "&mdash;"}</td><td>${
              esc(formatRcaDate(a.dueDate)) || "&mdash;"
            }</td><td>${esc(actionStatusLabel(a.status))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="rca__text rca__muted">No corrective actions recorded.</p>`;

  const docTitle = `Root Cause Analysis - ${incidentTitle}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${esc(docTitle)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #1f2937; margin: 24px; font-size: 11pt; line-height: 1.4; }
  .rca__toolbar { margin-bottom: 16px; }
  .rca__toolbar button { font: inherit; padding: 8px 14px; cursor: pointer; border: 1px solid #8592a3; border-radius: 6px; background: #fff; }
  .rca__head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid #1f2937; padding-bottom: 10px; margin-bottom: 16px; }
  .rca__brand { display: flex; align-items: center; gap: 12px; }
  .rca__logo { display: block; max-height: 64px; max-width: 230px; object-fit: contain; }
  .rca__company { font-weight: 600; font-size: 12pt; }
  .rca__title { text-align: right; }
  .rca__title h1 { font-size: 17pt; margin: 0; letter-spacing: 0.02em; }
  .rca__title div { color: #6b7280; font-size: 9.5pt; }
  .rca__ref { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; background: #f9fafb; }
  .rca__ref div { display: flex; flex-direction: column; }
  .rca__label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.05em; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d1d5db; break-after: avoid; }
  h3 { font-size: 10pt; margin: 10px 0 2px; color: #374151; }
  section { break-inside: avoid; }
  .rca__text { white-space: pre-wrap; margin: 0 0 6px; }
  .rca__muted { color: #9ca3af; font-style: italic; }
  .rca__list { margin: 0 0 6px; padding-left: 20px; }
  .rca__table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .rca__table th { text-align: left; background: #f3f4f6; border: 1px solid #d1d5db; padding: 5px 7px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.03em; }
  .rca__table td { border: 1px solid #d1d5db; padding: 6px 7px; vertical-align: top; white-space: pre-wrap; }
  .rca__table tr { break-inside: avoid; }
  .rca__num { text-align: center; font-weight: 600; }
  .rca__root { border: 2px solid #b91c1c; border-left-width: 6px; border-radius: 4px; padding: 10px 14px; background: #fef2f2; }
  .rca__root .rca__text { margin: 0; font-weight: 500; }
  .rca__signs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; break-inside: avoid; }
  .rca__sign { border-top: 1px solid #1f2937; padding-top: 4px; font-size: 9pt; color: #4b5563; display: flex; justify-content: space-between; }
  .rca__foot { margin-top: 28px; font-size: 8.5pt; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print { body { margin: 0; } .no-print { display: none !important; } }
</style></head><body>
<p class="rca__toolbar no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></p>
<header class="rca__head">
  <div class="rca__brand">${logo ? `<img class="rca__logo" src="${esc(logo)}" alt="${esc(company)}" />` : `<div class="rca__company">${esc(company)}</div>`}</div>
  <div class="rca__title"><h1>Root Cause Analysis</h1><div>5 Why investigation report</div></div>
</header>
<div class="rca__ref">${referenceHtml}</div>

<section><h2>Analysis team</h2>${teamHtml}</section>

<section><h2>Incident review</h2>
  <h3>Incident summary</h3>${paragraph(rca.incidentSummary)}
  <h3>Immediate action taken</h3>${paragraph(rca.immediateActions)}
  <h3>Contributing factors</h3>${factorsHtml}
</section>

<section><h2>5 Why analysis</h2>${whysHtml}</section>

<section><h2>Root cause</h2><div class="rca__root">${paragraph(rca.rootCause, "Root cause not yet identified.")}</div></section>

<section><h2>Corrective and preventive actions</h2>${actionsHtml}</section>

<div class="rca__signs">
  <div class="rca__sign"><span>Conducted by${rca.conductedBy ? `: ${esc(rca.conductedBy)}` : ""}</span><span>Date</span></div>
  <div class="rca__sign"><span>Reviewed and approved by</span><span>Date</span></div>
</div>
<div class="rca__foot"><span>${esc(company || "Forge Industrial Safety")} · ${esc(incidentTitle)}</span><span>Generated ${esc(generated)}</span></div>
</body></html>`;
}
