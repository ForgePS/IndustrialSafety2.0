/**
 * Shared helpers for industrial form submissions: normalize Firebase-style
 * responses into flat answers, and build printable HTML with company logo.
 */

import {
  isProducersMvrConsentForm,
  PRODUCERS_MVR_POLICY_FIELD_ID,
  PRODUCERS_MVR_POLICY_TEXT,
} from "./producers-mvr-policy.js";

export function unwrapJsonRecord(raw: unknown): Record<string, unknown> {
  let current: unknown = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return { ...(current as Record<string, unknown>) };
    }
    return {};
  }
  return {};
}

export function flattenFormResponseValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => flattenFormResponseValue(item)).filter((item) => item != null);
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.image === "string" && rec.image.trim()) return rec.image.trim();
    if (typeof rec.dataUrl === "string" && rec.dataUrl.trim()) return rec.dataUrl.trim();
    if (typeof rec.url === "string" && rec.url.trim()) return rec.url.trim();
    if (typeof rec.value === "string" || typeof rec.value === "number") return rec.value;
    const signedBy = rec.signedByName ?? rec.signedBy ?? null;
    const signedAt = rec.signedAt ?? null;
    if (signedBy || signedAt) {
      return {
        signedByName: signedBy,
        signedAt,
        method: rec.method ?? null,
      };
    }
  }
  return value;
}

export function flattenFormResponses(responses: unknown): Record<string, unknown> {
  const source = unwrapJsonRecord(responses);
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const flat = flattenFormResponseValue(value);
    if (flat == null || flat === "") continue;
    answers[key] = flat;
  }
  return answers;
}

/** Prefer column answers; fall back to source_payload.responses (Firebase). */
export function resolveFormAnswers(
  answers: unknown,
  sourcePayload: unknown,
): Record<string, unknown> {
  const fromColumn = unwrapJsonRecord(answers);
  if (Object.keys(fromColumn).length > 0) return flattenFormResponses(fromColumn);
  const payload = unwrapJsonRecord(sourcePayload);
  return flattenFormResponses(payload.responses ?? payload.answers ?? payload.values);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type FormPrintField = {
  id: string;
  label: string;
  kind?: "answer" | "content";
  content?: string;
};

export type FormPrintBranding = {
  logoUrl: string | null;
  reportIdentity: string | null;
  documentFooter: string | null;
  companyName: string | null;
};

function formatPrintValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) {
      return `<img src="${escapeHtml(value)}" alt="Signature" class="sig" />`;
    }
    return escapeHtml(value).replaceAll("\n", "<br />");
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.image === "string") {
      return `<img src="${escapeHtml(rec.image)}" alt="Signature" class="sig" />`;
    }
    const parts = [rec.signedByName, rec.signedAt]
      .map((part) => (part == null ? "" : String(part).trim()))
      .filter(Boolean);
    return escapeHtml(parts.join(" · ") || JSON.stringify(rec));
  }
  if (Array.isArray(value)) return escapeHtml(value.map(String).join(", "));
  return escapeHtml(String(value));
}

function formatContentBlock(label: string, content: string): string {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
  return `<section class="policy">
    <h2>${escapeHtml(label)}</h2>
    ${paragraphs || `<p>—</p>`}
  </section>`;
}

export function enrichPrintFieldsForDefinition(
  fields: FormPrintField[],
  definition: {
    title?: string | null;
    name?: string | null;
    formKey?: string | null;
    sourceDocumentId?: string | null;
  } | null,
): FormPrintField[] {
  if (!isProducersMvrConsentForm(definition)) return fields;
  let found = false;
  const next = fields.map((field) => {
    const isPolicy =
      field.id === PRODUCERS_MVR_POLICY_FIELD_ID ||
      /\bpolicy\b/i.test(field.label) ||
      /\bemployee agreement\b/i.test(field.label);
    if (!isPolicy) return field;
    found = true;
    return {
      ...field,
      kind: "content" as const,
      label: field.label || "Policy & Employee Agreement",
      content: PRODUCERS_MVR_POLICY_TEXT,
    };
  });
  if (found) return next;
  return [
    {
      id: PRODUCERS_MVR_POLICY_FIELD_ID,
      label: "Policy & Employee Agreement",
      kind: "content",
      content: PRODUCERS_MVR_POLICY_TEXT,
    },
    ...next,
  ];
}

export function buildFormSubmissionPrintableHtml(input: {
  title: string;
  status?: string | null;
  submittedAt?: string | null;
  fields: FormPrintField[];
  answers: Record<string, unknown>;
  branding: FormPrintBranding;
}): string {
  const title = escapeHtml(input.title || "Form submission");
  const company = escapeHtml(
    input.branding.reportIdentity?.trim() ||
      input.branding.companyName?.trim() ||
      "Company",
  );
  const footer = escapeHtml(
    input.branding.documentFooter?.trim() || company,
  );
  const logo = input.branding.logoUrl?.trim()
    ? `<img class="logo" src="${escapeHtml(input.branding.logoUrl.trim())}" alt="${company} logo" />`
    : "";
  const metaBits = [
    input.status ? `Status: ${escapeHtml(String(input.status))}` : "",
    input.submittedAt
      ? `Submitted: ${escapeHtml(new Date(input.submittedAt).toLocaleString())}`
      : "",
  ].filter(Boolean);

  const known = new Set(input.fields.map((field) => field.id));
  const contentBlocks: string[] = [];
  const answerRows: string[] = [];
  for (const field of input.fields) {
    if (field.kind === "content" || field.content) {
      contentBlocks.push(formatContentBlock(field.label, field.content ?? ""));
      continue;
    }
    answerRows.push(
      `<tr><th scope="row">${escapeHtml(field.label)}</th><td>${formatPrintValue(input.answers[field.id])}</td></tr>`,
    );
  }
  for (const [key, value] of Object.entries(input.answers)) {
    if (known.has(key)) continue;
    answerRows.push(
      `<tr><th scope="row">${escapeHtml(key)}</th><td>${formatPrintValue(value)}</td></tr>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 0; padding: 24px; }
    .sheet { max-width: 880px; margin: 0 auto; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1a365d; padding-bottom: 16px; margin-bottom: 20px; }
    .logo { max-height: 72px; max-width: 220px; object-fit: contain; }
    h1 { font-size: 1.5rem; margin: 0 0 4px; }
    h2 { font-size: 1.1rem; margin: 0 0 10px; }
    .meta { color: #444; font-size: 0.95rem; margin: 0 0 18px; }
    .policy { margin: 0 0 20px; padding: 14px 16px; border: 1px solid #d9dee3; background: #f8f9fa; }
    .policy p { margin: 0 0 10px; line-height: 1.45; }
    .policy p:last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; vertical-align: top; padding: 10px 8px; border-bottom: 1px solid #d9dee3; }
    th { width: 34%; color: #334; font-weight: 600; }
    .sig { max-height: 96px; max-width: 100%; background: #fff; border: 1px solid #d9dee3; }
    footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d9dee3; color: #555; font-size: 0.85rem; }
    @media print {
      body { padding: 0; }
      header { break-after: avoid; }
      .policy, .sig { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      ${logo}
      <div>
        <div class="company">${company}</div>
        <h1>${title}</h1>
      </div>
    </header>
    ${metaBits.length ? `<p class="meta">${metaBits.join(" · ")}</p>` : ""}
    ${contentBlocks.join("\n")}
    <table>
      <tbody>
        ${answerRows.join("\n") || `<tr><td colspan="2">No answers recorded.</td></tr>`}
      </tbody>
    </table>
    <footer>${footer}</footer>
  </div>
</body>
</html>`;
}
