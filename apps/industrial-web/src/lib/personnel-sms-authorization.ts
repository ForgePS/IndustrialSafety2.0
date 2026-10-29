/**
 * SMS Authorization on the personnel file (Emergency Alerts / 10DLC digital opt-in).
 * SMS Notification number is always the personnel `phone` field.
 */

import { EMERGENCY_SMS_CONSENT_TEXT } from "@forge/contracts";

export const SMS_AUTHORIZATION_CONSENT_TEXT = EMERGENCY_SMS_CONSENT_TEXT;

export type PersonnelSmsAuthorization = {
  phone: string;
  smsNotificationNumber: string;
  smsAuthorized: boolean;
  smsAuthorizedAt: string | null;
  smsAuthorizedByUserId: string | null;
  smsOptedOutAt: string | null;
  phoneValid: boolean;
};

export function normalizeSmsDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatSmsNotificationDisplay(phone: string | null | undefined): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const digits = normalizeSmsDigits(raw);
  if (!digits || digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function parsePersonnelSmsAuthorization(
  record: Record<string, unknown> | null | undefined,
): PersonnelSmsAuthorization {
  const phone = String(record?.phone ?? "").trim();
  const notified = String(record?.smsNotificationNumber ?? phone).trim() || phone;
  const authorizedAt =
    typeof record?.smsAuthorizedAt === "string" && record.smsAuthorizedAt.trim()
      ? record.smsAuthorizedAt.trim()
      : null;
  const optedOutAt =
    typeof record?.smsOptedOutAt === "string" && record.smsOptedOutAt.trim()
      ? record.smsOptedOutAt.trim()
      : null;
  const authorizedBy =
    typeof record?.smsAuthorizedByUserId === "string" && record.smsAuthorizedByUserId.trim()
      ? record.smsAuthorizedByUserId.trim()
      : null;
  const smsAuthorized = record?.smsAuthorized === true || (Boolean(authorizedAt) && !optedOutAt);
  return {
    phone,
    smsNotificationNumber: notified || phone,
    smsAuthorized,
    smsAuthorizedAt: authorizedAt,
    smsAuthorizedByUserId: authorizedBy,
    smsOptedOutAt: optedOutAt,
    phoneValid: Boolean(normalizeSmsDigits(phone)),
  };
}

export type PersonnelSmsConsentRecord = {
  id: string;
  action: "AUTHORIZED" | "REVOKED" | string;
  method: "QR_SELF_SERVICE" | "ADMIN" | string;
  phoneNumber: string | null;
  previousPhoneNumber: string | null;
  consentText: string | null;
  consentVersion: string | null;
  signatureName: string | null;
  employeeNumber: string | null;
  qrLinkId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorEmail: string | null;
};

export function smsConsentMethodLabel(method: string): string {
  if (method === "QR_SELF_SERVICE") return "Employee QR signup";
  if (method === "ADMIN") return "Admin";
  return method;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrintDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const PRINT_STYLES = `
  body { font-family: Arial, Helvetica, sans-serif; color: #222; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; vertical-align: top; }
  td.k { width: 32%; background: #f6f6f6; font-weight: bold; }
  .consent { white-space: pre-wrap; border: 1px solid #ccc; padding: 12px; font-size: 13px; line-height: 1.45; }
  .sig { font-family: "Brush Script MT", "Segoe Script", cursive; font-size: 26px; border-bottom: 1px solid #333; padding: 4px 0; min-width: 320px; display: inline-block; }
`;

/** Printable copy of one signed (or admin-recorded) SMS consent for the personnel file. */
export function buildSmsConsentPrintableHtml(
  record: PersonnelSmsConsentRecord,
  context: { personName: string; companyName?: string | null },
): string {
  const authorized = record.action === "AUTHORIZED";
  const title = authorized
    ? "Emergency SMS Alerts - Authorization"
    : "Emergency SMS Alerts - Authorization Revoked";
  const rows: Array<[string, string | null]> = [
    ["Employee", context.personName],
    ["Employee #", record.employeeNumber],
    ["SMS Notification number", formatSmsNotificationDisplay(record.phoneNumber)],
    [
      "Previous number on file",
      record.previousPhoneNumber ? formatSmsNotificationDisplay(record.previousPhoneNumber) : null,
    ],
    ["Recorded", formatPrintDate(record.createdAt)],
    ["Method", smsConsentMethodLabel(record.method)],
    [
      "Recorded by",
      record.method === "ADMIN" ? (record.actorEmail ?? "Admin") : "Employee (self-service)",
    ],
    ["Consent version", record.consentVersion],
    ["IP address", record.ipAddress],
    ["Device", record.userAgent],
  ];
  const tableRows = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  const consent = record.consentText
    ? `<h3>Consent language agreed to</h3><div class="consent">${escapeHtml(record.consentText)}</div>`
    : "";
  const signature = record.signatureName
    ? `<p style="margin-top:28px">Electronic signature:</p><div class="sig">${escapeHtml(record.signatureName)}</div>
       <p class="muted">Typed signature with consent checkbox, submitted ${escapeHtml(formatPrintDate(record.createdAt))}.</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="muted">${escapeHtml(context.companyName ?? "")} - Personnel file record ${escapeHtml(record.id)}</div>
<table>${tableRows}</table>
${consent}
${signature}
</body></html>`;
}

/** Wall poster for the tenant Emergency SMS Alerts signup QR. */
export function buildSmsSignupPosterHtml(input: {
  dataUrl: string;
  url: string;
  companyName?: string | null;
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Emergency SMS Alerts signup</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #222; text-align: center; margin: 40px; }
  h1 { font-size: 34px; margin: 0 0 8px; }
  h2 { font-size: 20px; font-weight: normal; margin: 0 0 24px; color: #444; }
  img { width: 340px; height: 340px; }
  ol { text-align: left; display: inline-block; font-size: 16px; line-height: 1.6; margin-top: 24px; }
  .url { font-size: 11px; color: #666; word-break: break-all; margin-top: 16px; }
</style></head><body>
<h2>${escapeHtml(input.companyName ?? "")}</h2>
<h1>Sign up for Emergency SMS Alerts</h1>
<h2>Get text alerts for emergencies, weather, and safety notices.</h2>
<img src="${escapeHtml(input.dataUrl)}" alt="Emergency SMS Alerts signup QR code" />
<br/>
<ol>
  <li>Scan this code with your phone camera.</li>
  <li>Enter your employee number and last name.</li>
  <li>Enter your mobile number, read the consent, and sign.</li>
</ol>
<p>Message and data rates may apply. Reply STOP to cancel or HELP for help.</p>
<div class="url">${escapeHtml(input.url)}</div>
</body></html>`;
}

export function smsAuthorizationStatusLabel(state: PersonnelSmsAuthorization): string {
  if (state.smsOptedOutAt) return "Opted out";
  if (state.smsAuthorized) return "Authorized";
  if (!state.phone) return "Phone required";
  if (!state.phoneValid) return "Invalid phone";
  return "Not authorized";
}
