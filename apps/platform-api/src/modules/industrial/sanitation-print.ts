/**
 * Printable HTML for grain facility sanitation reports (window.print()).
 */

export function escapeSanitationHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function cell(value: unknown): string {
  return escapeSanitationHtml(plain(value) || "—");
}

const PRINT_CSS = `
  body { font-family: Georgia, "Times New Roman", serif; margin: 20px; color: #1a1a1a; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; font-weight: 700; }
  h2 { font-size: 1.05rem; margin: 22px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 0.95rem; margin: 14px 0 6px; }
  .muted { color: #555; font-size: 0.85rem; }
  .toolbar { margin-bottom: 14px; }
  .toolbar button {
    font: inherit; padding: 8px 14px; cursor: pointer;
    border: 1px solid #666; border-radius: 4px; background: #fff;
  }
  .head { display: flex; gap: 16px; align-items: center; margin-bottom: 14px; }
  .logo { max-height: 48px; max-width: 160px; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 12px; }
  .meta div strong { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 11px; }
  th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
  .summary-card { border: 1px solid #bbb; padding: 8px; text-align: center; }
  .summary-card .n { font-size: 1.4rem; font-weight: 700; }
  .page-break { page-break-before: always; }
  @media print {
    body { margin: 10mm; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
`;

function printShell(title: string, bodyHtml: string, branding?: { companyName?: string | null; logoUrl?: string | null }): string {
  const company = plain(branding?.companyName);
  const logo = plain(branding?.logoUrl);
  const logoHtml = logo
    ? `<img class="logo" src="${escapeSanitationHtml(logo)}" alt="" />`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${escapeSanitationHtml(title)}</title>
<style>${PRINT_CSS}</style></head><body>
<p class="toolbar no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></p>
<div class="head">${logoHtml}<div>
  <h1>${escapeSanitationHtml(title)}</h1>
  ${company ? `<p class="muted">${escapeSanitationHtml(company)}</p>` : ""}
</div></div>
${bodyHtml}
</body></html>`;
}

function metaGrid(rows: Array<{ label: string; value: string }>): string {
  const filtered = rows.filter((r) => r.value.trim() !== "");
  if (!filtered.length) return "";
  return `<div class="meta">${filtered
    .map(
      (r) =>
        `<div><strong>${escapeSanitationHtml(r.label)}</strong>${escapeSanitationHtml(r.value)}</div>`,
    )
    .join("")}</div>`;
}

function tableHtml(headers: string[], rows: unknown[][]): string {
  if (!rows.length) return `<p class="muted">No records.</p>`;
  return `<table><thead><tr>${headers
    .map((h) => `<th>${escapeSanitationHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

export function buildSanitationInspectionPrintableHtml(
  inspection: Record<string, unknown>,
  findings: Array<Record<string, unknown>> = [],
  branding?: { companyName?: string | null; logoUrl?: string | null },
): string {
  const title =
    plain(inspection.title) ||
    plain(inspection.inspectionNumber) ||
    "Sanitation inspection";
  const meta = metaGrid([
    { label: "Inspection #", value: plain(inspection.inspectionNumber) },
    { label: "Type", value: plain(inspection.inspectionType) },
    { label: "Status", value: plain(inspection.status) },
    { label: "Compliance", value: plain(inspection.complianceStatus) },
    { label: "Score", value: plain(inspection.scorePercent) },
    { label: "Severity max", value: plain(inspection.severityMax) },
    { label: "Started", value: plain(inspection.startedAt) },
    { label: "Completed", value: plain(inspection.completedAt) },
    { label: "Shift", value: plain(inspection.shift) },
    { label: "Product line", value: plain(inspection.productLine) },
    { label: "Notes", value: plain(inspection.notes) },
  ]);

  const responsesRaw = inspection.responsesJson;
  const responses =
    responsesRaw && typeof responsesRaw === "object" && !Array.isArray(responsesRaw)
      ? (responsesRaw as Record<string, Record<string, unknown>>)
      : {};
  const responseBlocks = Object.entries(responses).map(([questionId, resp]) => {
    const photos = Array.isArray(resp.photos) ? resp.photos : [];
    const legacy = plain(resp.photoDataUrl);
    type PhotoSource = {
      dataUrl: string;
      originalDataUrl?: string;
      hasMarkup: boolean;
      fileName?: string;
    };
    const sources: PhotoSource[] = [];
    for (const p of photos) {
      const row = (p ?? {}) as Record<string, unknown>;
      const dataUrl = plain(row.dataUrl);
      if (!dataUrl) continue;
      const item: PhotoSource = {
        dataUrl,
        hasMarkup: row.hasMarkup === true,
      };
      const originalDataUrl = plain(row.originalDataUrl);
      if (originalDataUrl) item.originalDataUrl = originalDataUrl;
      const fileName = plain(row.fileName);
      if (fileName) item.fileName = fileName;
      sources.push(item);
    }
    if (legacy) {
      sources.push({ dataUrl: legacy, hasMarkup: false });
    }
    const photoCount = sources.length;
    const photoHtml = sources.length
      ? sources
          .map((photo, index) => {
            const preferMarked = photo.hasMarkup && photo.dataUrl;
            const showBoth = photo.hasMarkup && photo.originalDataUrl;
            if (showBoth) {
              return (
                `<div style="margin:8px 0">` +
                `<div class="muted">Photo ${index + 1} — Original</div>` +
                `<img src="${escapeSanitationHtml(photo.originalDataUrl!)}" alt="Original photo" style="max-width:48%;max-height:280px;border:1px solid #ccc;margin-right:1%" />` +
                `<div class="muted">Marked-up</div>` +
                `<img src="${escapeSanitationHtml(photo.dataUrl)}" alt="Marked photo" style="max-width:48%;max-height:280px;border:1px solid #ccc" />` +
                `</div>`
              );
            }
            const src = preferMarked || photo.dataUrl;
            return (
              `<figure style="margin:8px 0">` +
              `<img src="${escapeSanitationHtml(src)}" alt="Inspection photo" style="max-width:100%;max-height:320px;border:1px solid #ccc" />` +
              `<figcaption class="muted">${escapeSanitationHtml(
                photo.hasMarkup ? "Marked-up photo" : photo.fileName || `Photo ${index + 1}`,
              )}</figcaption>` +
              `</figure>`
            );
          })
          .join("")
      : "";
    return {
      row: [
        plain(resp.label) || questionId,
        plain(resp.result),
        plain(resp.notes) || plain(resp.comments),
        photoCount > 0 ? `${photoCount} photo(s)` : "—",
        plain(resp.photoNote),
      ],
      photoHtml,
    };
  });
  const responseRows = responseBlocks.map((b) => b.row);
  const photosSection = responseBlocks
    .filter((b) => b.photoHtml)
    .map(
      (b, i) =>
        `<h3>${escapeSanitationHtml(String(b.row[0] || `Item ${i + 1}`))}</h3>${b.photoHtml}`,
    )
    .join("");

  const signaturesRaw = inspection.signaturesJson;
  const signatures = Array.isArray(signaturesRaw) ? signaturesRaw : [];
  const signatureHtml = signatures.length
    ? `<h2>Signatures</h2>${signatures
        .map((sig) => {
          const row = (sig ?? {}) as Record<string, unknown>;
          const value = plain(row.value);
          const name = plain(row.name) || plain(row.type) || "Inspector";
          const signedAt = plain(row.signedAt);
          if (value.startsWith("data:image")) {
            return `<div style="margin:10px 0"><strong>${escapeSanitationHtml(name)}</strong>${
              signedAt ? ` <span class="muted">(${escapeSanitationHtml(signedAt)})</span>` : ""
            }<br/><img src="${escapeSanitationHtml(value)}" alt="Signature" style="max-height:80px;max-width:320px;border:1px solid #ccc;margin-top:6px" /></div>`;
          }
          const typed = value.startsWith("typed:") ? value.slice(6) : value;
          return `<div style="margin:10px 0"><strong>${escapeSanitationHtml(name)}</strong>: ${escapeSanitationHtml(
            typed || "—",
          )}${signedAt ? ` <span class="muted">(${escapeSanitationHtml(signedAt)})</span>` : ""}</div>`;
        })
        .join("")}`
    : "";

  const findingRows = findings.map((f) => [
    f.findingNumber,
    f.severity,
    f.category,
    f.title,
    f.status,
    f.isRecurring ? `Yes (${plain(f.recurrenceCount)})` : "No",
  ]);
  const body = `${meta}
<h2>Checklist responses (${responseRows.length})</h2>
${tableHtml(["Item", "Result", "Notes", "Photos", "Photo note"], responseRows)}
${photosSection ? `<h2>Photo evidence</h2>${photosSection}` : ""}
<h2>Findings (${findings.length})</h2>
${tableHtml(
  ["Number", "Severity", "Category", "Title", "Status", "Recurring"],
  findingRows,
)}
${signatureHtml}`;
  return printShell(title, body, branding);
}

export type SanitationAuditPackageInput = {
  dateFrom: string;
  dateTo: string;
  siteName?: string;
  inspections?: Array<Record<string, unknown>>;
  findings?: Array<Record<string, unknown>>;
  dust?: Array<Record<string, unknown>>;
  spills?: Array<Record<string, unknown>>;
  pestFindings?: Array<Record<string, unknown>>;
  cleaningTasks?: Array<Record<string, unknown>>;
  mss?: Array<Record<string, unknown>>;
  chemicals?: Array<Record<string, unknown>>;
  branding?: { companyName?: string | null; logoUrl?: string | null };
};

export function buildSanitationAuditPackageHtml(input: SanitationAuditPackageInput): string {
  const inspections = input.inspections ?? [];
  const findings = input.findings ?? [];
  const dust = input.dust ?? [];
  const spills = input.spills ?? [];
  const pestFindings = input.pestFindings ?? [];
  const cleaningTasks = input.cleaningTasks ?? [];
  const mss = input.mss ?? [];
  const chemicals = input.chemicals ?? [];

  const summary = `<div class="summary-grid">
  <div class="summary-card"><div class="n">${inspections.length}</div>Inspections</div>
  <div class="summary-card"><div class="n">${findings.length}</div>Findings</div>
  <div class="summary-card"><div class="n">${dust.length}</div>Dust readings</div>
  <div class="summary-card"><div class="n">${spills.length}</div>Spills</div>
</div>
<div class="summary-grid">
  <div class="summary-card"><div class="n">${pestFindings.length}</div>Pest findings</div>
  <div class="summary-card"><div class="n">${cleaningTasks.length}</div>Cleaning tasks</div>
  <div class="summary-card"><div class="n">${mss.length}</div>MSS items</div>
  <div class="summary-card"><div class="n">${chemicals.length}</div>Chemicals</div>
</div>`;

  const body = `${metaGrid([
    { label: "Period from", value: plain(input.dateFrom) },
    { label: "Period to", value: plain(input.dateTo) },
    { label: "Site", value: plain(input.siteName) || "All sites" },
  ])}
${summary}
<h2>Inspections</h2>
${tableHtml(
  ["Number", "Title", "Type", "Compliance", "Score", "Completed"],
  inspections.map((r) => [
    r.inspectionNumber,
    r.title,
    r.inspectionType,
    r.complianceStatus,
    r.scorePercent,
    r.completedAt,
  ]),
)}
<h2>Findings</h2>
${tableHtml(
  ["Number", "Severity", "Category", "Title", "Status"],
  findings.map((r) => [r.findingNumber, r.severity, r.category, r.title, r.status]),
)}
<div class="page-break"></div>
<h2>Dust measurements</h2>
${tableHtml(
  ["Number", "Depth (in)", "Exceeds", "Priority", "Measured"],
  dust.map((r) => [
    r.measurementNumber,
    r.dustDepthInches,
    r.exceedsActionLevel ? "YES" : "NO",
    r.isPriorityArea ? "YES" : "NO",
    r.measuredAt,
  ]),
)}
<h2>Spills</h2>
${tableHtml(
  ["Number", "Product", "Status", "Reported"],
  spills.map((r) => [r.spillNumber, r.product, r.status, r.reportedAt]),
)}
<h2>Pest findings</h2>
${tableHtml(
  ["Category", "Species", "Activity", "Status", "Observed"],
  pestFindings.map((r) => [
    r.pestCategory,
    r.pestSpecies,
    r.activityLevel,
    r.status,
    r.observedAt,
  ]),
)}
<h2>Cleaning tasks</h2>
${tableHtml(
  ["Number", "Title", "Status", "Due"],
  cleaningTasks.map((r) => [r.taskNumber, r.title, r.status, r.dueAt]),
)}
<h2>Master sanitation schedule</h2>
${tableHtml(
  ["Title", "Frequency", "Next due", "Status"],
  mss.map((r) => [r.title, r.frequency, r.nextDueAt, r.status]),
)}
<h2>Chemicals</h2>
${tableHtml(
  ["Name", "Manufacturer", "Status", "Food contact"],
  chemicals.map((r) => [
    r.name,
    r.manufacturer,
    r.status,
    r.foodContactApproved ? "YES" : "NO",
  ]),
)}`;

  return printShell(
    `Sanitation audit package (${plain(input.dateFrom)} – ${plain(input.dateTo)})`,
    body,
    input.branding,
  );
}

export function buildSanitationDustReportHtml(
  measurements: Array<Record<string, unknown>>,
  options: {
    title?: string;
    siteName?: string;
    dateFrom?: string;
    dateTo?: string;
    branding?: { companyName?: string | null; logoUrl?: string | null };
  } = {},
): string {
  const title = options.title || "Grain dust housekeeping report";
  const alerts = measurements.filter((m) => m.exceedsActionLevel === true);
  const body = `${metaGrid([
    { label: "Site", value: plain(options.siteName) || "All sites" },
    { label: "From", value: plain(options.dateFrom) },
    { label: "To", value: plain(options.dateTo) },
    { label: "Total measurements", value: String(measurements.length) },
    { label: "Action-level exceedances", value: String(alerts.length) },
  ])}
<h2>Measurements</h2>
${tableHtml(
  ["Number", "Surface", "Point", "Depth (in)", "Threshold", "Exceeds", "Priority", "Measured"],
  measurements.map((r) => [
    r.measurementNumber,
    r.surface,
    r.measurementPoint,
    r.dustDepthInches,
    r.actionThresholdInches,
    r.exceedsActionLevel ? "YES" : "NO",
    r.isPriorityArea ? "YES" : "NO",
    r.measuredAt,
  ]),
)}`;
  return printShell(title, body, options.branding);
}

export function buildSanitationMssReportHtml(
  items: Array<Record<string, unknown>>,
  options: {
    title?: string;
    siteName?: string;
    branding?: { companyName?: string | null; logoUrl?: string | null };
  } = {},
): string {
  const title = options.title || "Master sanitation schedule";
  const active = items.filter((i) => String(i.status ?? "").toUpperCase() === "ACTIVE");
  const body = `${metaGrid([
    { label: "Site", value: plain(options.siteName) || "All sites" },
    { label: "Items", value: String(items.length) },
    { label: "Active", value: String(active.length) },
  ])}
<h2>Schedule</h2>
${tableHtml(
  ["Title", "Task", "Frequency", "Method", "Next due", "Last completed", "Status"],
  items.map((r) => [
    r.title,
    r.cleaningTask,
    r.frequency,
    r.cleaningMethod,
    r.nextDueAt,
    r.lastCompletedAt,
    r.status,
  ]),
)}`;
  return printShell(title, body, options.branding);
}
