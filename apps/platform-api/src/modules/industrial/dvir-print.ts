/**
 * Printable HTML for DVIR inspection reports (single report or full calendar day).
 */

import {
  dvirDefectCountFromPayload,
  resolveDvirItemsFromPayload,
  type DvirItemAnswer,
  type DvirTripType,
} from "./dvir-helpers.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unwrapPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function tripLabel(trip: string): string {
  return trip === "POST_TRIP" ? "Post-trip" : "Pre-trip";
}

function answerLabel(answer: string): string {
  if (answer === "YES") return "Yes";
  if (answer === "NO") return "No";
  if (answer === "NA") return "N/A";
  return "—";
}

function resolveItems(payload: Record<string, unknown>): DvirItemAnswer[] {
  return resolveDvirItemsFromPayload(payload);
}

function sectionRows(items: DvirItemAnswer[], section: string): string {
  const sectionItems = items.filter((item) => item.section === section);
  if (sectionItems.length === 0) return "<p>None listed.</p>";
  return `<table class="dvir-print__table"><thead><tr><th>Item</th><th>Answer</th><th>Notes</th></tr></thead><tbody>${sectionItems
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(
          answerLabel(String(item.answer ?? "")),
        )}</td><td>${escapeHtml(item.notes || "")}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function signatureBlock(label: string, name: string, signedAt: string, dataUrl: string): string {
  const img =
    dataUrl && dataUrl.startsWith("data:")
      ? `<img class="dvir-print__sig" src="${dataUrl}" alt="${escapeHtml(label)}" />`
      : "";
  return `<div class="dvir-print__sig-block"><strong>${escapeHtml(label)}</strong><div>${escapeHtml(
    name || "—",
  )}</div><div class="muted">${escapeHtml(signedAt || "")}</div>${img}</div>`;
}

export function buildDvirPrintableHtml(
  record: Record<string, unknown>,
  branding: { companyName?: string | null; logoUrl?: string | null } = {},
): string {
  const payload = unwrapPayload(record.sourcePayload ?? record);
  const merged = { ...payload, ...record };
  const trip = String(merged.tripType ?? "").toUpperCase();
  const tripType: DvirTripType = trip === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP";
  const inspectionDate = String(merged.inspectionDate ?? merged.recordDate ?? "").slice(0, 10);
  const title = String(merged.title ?? `${tripLabel(tripType)} DVIR`);
  const items = resolveItems(merged);
  const defects = dvirDefectCountFromPayload(merged);
  const company = String(branding.companyName ?? "").trim();
  const logo = String(branding.logoUrl ?? "").trim();
  const logoHtml = logo ? `<img class="dvir-print__logo" src="${escapeHtml(logo)}" alt="" />` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  h2 { font-size: 1rem; margin: 20px 0 8px; }
  .muted { color: #566a7f; font-size: 0.875rem; }
  .dvir-print__head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .dvir-print__logo { max-height: 48px; max-width: 160px; }
  .dvir-print__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 16px; }
  .dvir-print__table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .dvir-print__table th, .dvir-print__table td { border: 1px solid #d9dee3; padding: 6px 8px; text-align: left; vertical-align: top; }
  .dvir-print__table th { background: #f5f5f9; }
  .dvir-print__sigs { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; }
  .dvir-print__sig { max-width: 220px; max-height: 80px; border: 1px solid #d9dee3; margin-top: 8px; }
  .dvir-print__report { border-top: 2px solid #d9dee3; padding-top: 16px; margin-top: 24px; }
  @media print { body { margin: 12px; } }
</style></head><body>
<div class="dvir-print__head">${logoHtml}<div><h1>${escapeHtml(title)}</h1>
<p class="muted">${escapeHtml(company)}</p></div></div>
<div class="dvir-print__meta">
  <div><strong>Inspection date</strong><br/>${escapeHtml(inspectionDate)}</div>
  <div><strong>Trip</strong><br/>${escapeHtml(tripLabel(tripType))}</div>
  <div><strong>Truck #</strong><br/>${escapeHtml(String(merged.truckNumber ?? ""))}</div>
  <div><strong>Trailers</strong><br/>${escapeHtml(String(merged.trailerNumbers ?? ""))}</div>
  <div><strong>Driver</strong><br/>${escapeHtml(
    String(merged.workerName ?? merged.driverName ?? ""),
  )}</div>
  <div><strong>Defects</strong><br/>${defects > 0 ? `${defects} noted` : "None"}</div>
</div>
<h2>Truck / tractor</h2>${sectionRows(items, "truck")}
<h2>Emergency equipment</h2>${sectionRows(items, "safety")}
<h2>Trailer</h2>${sectionRows(items, "trailer")}
<h2>Remarks</h2><p>${escapeHtml(String(merged.remarks ?? ""))}</p>
<h2>Signatures</h2>
<div class="dvir-print__sigs">
  ${signatureBlock(
    "Driver",
    String(merged.workerName ?? merged.driverName ?? ""),
    String(merged.driverSignedAt ?? ""),
    String(merged.driverSignatureDataUrl ?? ""),
  )}
  ${signatureBlock(
    "Mechanic",
    String(merged.mechanicName ?? ""),
    String(merged.mechanicSignedAt ?? ""),
    String(merged.mechanicSignatureDataUrl ?? ""),
  )}
  ${signatureBlock(
    "Driver review",
    String(merged.workerName ?? merged.driverName ?? ""),
    String(merged.driverReviewSignedAt ?? ""),
    String(merged.driverReviewSignatureDataUrl ?? ""),
  )}
</div>
</body></html>`;
}

export function buildDvirDayPrintableHtml(
  inspectionDate: string,
  vehicleLabel: string,
  records: ReadonlyArray<Record<string, unknown>>,
  branding: { companyName?: string | null; logoUrl?: string | null } = {},
): string {
  const company = String(branding.companyName ?? "").trim();
  const logo = String(branding.logoUrl ?? "").trim();
  const logoHtml = logo ? `<img class="dvir-print__logo" src="${escapeHtml(logo)}" alt="" />` : "";
  const sorted = [...records].sort((a, b) => {
    const ta = String(a.tripType ?? "").toUpperCase() === "POST_TRIP" ? 1 : 0;
    const tb = String(b.tripType ?? "").toUpperCase() === "POST_TRIP" ? 1 : 0;
    return ta - tb;
  });
  const body =
    sorted.length === 0
      ? "<p>No DVIR inspections were recorded for this date.</p>"
      : sorted
          .map((record) => {
            const inner = buildDvirPrintableHtml(record, branding);
            const match = inner.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const content = match ? match[1] : inner;
            return `<section class="dvir-print__report">${content}</section>`;
          })
          .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>DVIR ${escapeHtml(inspectionDate)} — ${escapeHtml(vehicleLabel)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  .muted { color: #566a7f; font-size: 0.875rem; }
  .dvir-print__head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .dvir-print__logo { max-height: 48px; max-width: 160px; }
  .dvir-print__report + .dvir-print__report { margin-top: 32px; }
  @media print { body { margin: 12px; } }
</style></head><body>
<div class="dvir-print__head">${logoHtml}<div>
<h1>DVIR — ${escapeHtml(inspectionDate)}</h1>
<p class="muted">${escapeHtml(vehicleLabel)}${company ? ` · ${escapeHtml(company)}` : ""}</p>
</div></div>
${body}
</body></html>`;
}
