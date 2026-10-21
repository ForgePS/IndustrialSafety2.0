import { openPrintableHtmlPopup } from "@/lib/dvir";

export type SupplyIssuePrintLine = {
  itemNumber?: string | null | undefined;
  itemName: string;
  quantity: string | number;
  unitOfMeasure?: string | null | undefined;
  locationName?: string | null | undefined;
};

export type SupplyIssuePrintInput = {
  title?: string;
  tenantName?: string | null | undefined;
  issuedAt?: Date | string;
  recipientName?: string | null | undefined;
  recipientId?: string | null | undefined;
  /** JPEG/PNG data URL from SignaturePad when the recipient signed digitally. */
  recipientSignatureDataUrl?: string | null | undefined;
  recipientSignedAt?: Date | string | null | undefined;
  facilityName?: string | null | undefined;
  divisionName?: string | null | undefined;
  departmentName?: string | null | undefined;
  issuedBy?: string | null | undefined;
  notes?: string | null | undefined;
  lines: SupplyIssuePrintLine[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(value?: Date | string | null): string {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString();
  return d.toLocaleString();
}

function formatQty(value: string | number): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? (value % 1 === 0 ? String(value) : value.toFixed(2)) : "0";
  }
  const n = Number(value);
  if (Number.isFinite(n)) return n % 1 === 0 ? String(n) : n.toFixed(2);
  return String(value || "0");
}

function safeSignatureSrc(dataUrl: string | null | undefined): string | null {
  const value = dataUrl?.trim() ?? "";
  if (!value.startsWith("data:image/")) return null;
  // Keep print HTML safe: only allow data:image/*;base64,...
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  return value;
}

/** Printable issue acknowledgment with recipient signature (digital or blank line). */
export function buildSupplyIssueAcknowledgmentHtml(input: SupplyIssuePrintInput): string {
  const title = input.title?.trim() || "Safety Supplies Issue Acknowledgment";
  const tenant = input.tenantName?.trim() || "Forge Industrial Safety";
  const lines = input.lines.filter((line) => line.itemName?.trim());
  const rows =
    lines.length > 0
      ? lines
          .map(
            (line) => `
      <tr>
        <td>${escapeHtml(line.itemNumber || "—")}</td>
        <td>${escapeHtml(line.itemName)}</td>
        <td class="qty">${escapeHtml(formatQty(line.quantity))}</td>
        <td>${escapeHtml(line.unitOfMeasure || "EA")}</td>
        <td>${escapeHtml(line.locationName || "—")}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No items listed.</td></tr>`;

  const metaBits = [
    input.facilityName ? `<div><strong>Facility:</strong> ${escapeHtml(input.facilityName)}</div>` : "",
    input.divisionName ? `<div><strong>Division:</strong> ${escapeHtml(input.divisionName)}</div>` : "",
    input.departmentName
      ? `<div><strong>Department:</strong> ${escapeHtml(input.departmentName)}</div>`
      : "",
    input.issuedBy ? `<div><strong>Issued by:</strong> ${escapeHtml(input.issuedBy)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  const printedName = input.recipientName?.trim() || "";
  const signatureSrc = safeSignatureSrc(input.recipientSignatureDataUrl);
  const signedAtLabel = input.recipientSignedAt
    ? formatWhen(input.recipientSignedAt)
    : formatWhen(input.issuedAt);

  const signatureBlock = signatureSrc
    ? `<div class="sig-image-wrap"><img class="sig-image" src="${signatureSrc}" alt="Recipient signature" /></div>
        <div class="sig-label">Recipient signature</div>`
    : `<div class="sig-line"></div>
        <div class="sig-label">Recipient signature</div>`;

  const printedNameBlock = printedName
    ? `<div class="sig-printed">${escapeHtml(printedName)}</div>
        <div class="sig-label">Recipient printed name</div>`
    : `<div class="sig-line"></div>
        <div class="sig-label">Recipient printed name</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0.6in; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      margin: 0;
      padding: 24px;
      font-size: 13px;
      line-height: 1.4;
    }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .tenant { color: #444; margin-bottom: 16px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 18px; }
    .meta div { margin: 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; }
    td.qty { text-align: right; white-space: nowrap; }
    .muted { color: #666; }
    .notes { margin: 0 0 24px; padding: 10px 12px; border: 1px solid #ddd; background: #fafafa; }
    .ack {
      margin-top: 28px;
      padding-top: 8px;
      border-top: 1px solid #bbb;
    }
    .ack p { margin: 0 0 18px; }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 180px;
      gap: 28px 32px;
      margin-top: 28px;
    }
    .sig-line {
      border-bottom: 1px solid #111;
      min-height: 36px;
      margin-bottom: 6px;
    }
    .sig-image-wrap {
      border-bottom: 1px solid #111;
      min-height: 56px;
      margin-bottom: 6px;
      padding-bottom: 4px;
    }
    .sig-image {
      display: block;
      max-width: 100%;
      max-height: 72px;
      height: auto;
    }
    .sig-printed {
      border-bottom: 1px solid #111;
      min-height: 36px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      font-size: 15px;
    }
    .sig-label { font-size: 12px; color: #333; }
    .footer {
      margin-top: 36px;
      font-size: 11px;
      color: #666;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="tenant">${escapeHtml(tenant)}</div>
  <div class="meta">
    <div><strong>Date / time:</strong> ${escapeHtml(formatWhen(input.issuedAt))}</div>
    <div><strong>Recipient:</strong> ${escapeHtml(printedName || "________________")}</div>
    ${
      input.recipientId
        ? `<div><strong>Personnel ID:</strong> ${escapeHtml(input.recipientId)}</div>`
        : ""
    }
    ${metaBits}
  </div>

  <table>
    <thead>
      <tr>
        <th>Item #</th>
        <th>Item</th>
        <th>Qty</th>
        <th>UOM</th>
        <th>From location</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${
    input.notes?.trim()
      ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(input.notes.trim())}</div>`
      : ""
  }

  <div class="ack">
    <p>
      I acknowledge receipt of the safety supplies listed above in good condition and understand
      they are issued for work-related use according to company policy.
    </p>
    <div class="sig-grid">
      <div>
        ${signatureBlock}
      </div>
      <div>
        <div class="sig-printed">${escapeHtml(signedAtLabel)}</div>
        <div class="sig-label">Date signed</div>
      </div>
      <div>
        ${printedNameBlock}
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Issued by (initials)</div>
      </div>
    </div>
  </div>

  <div class="footer">Forge Industrial Safety · Safety Supplies issue acknowledgment</div>
</body>
</html>`;
}

export function printSupplyIssueAcknowledgment(input: SupplyIssuePrintInput): string | null {
  return openPrintableHtmlPopup(buildSupplyIssueAcknowledgmentHtml(input), true);
}
