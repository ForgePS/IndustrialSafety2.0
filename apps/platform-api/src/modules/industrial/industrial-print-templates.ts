/**
 * Pure Print Manager Phase 4 template helpers (no DB I/O).
 */

export type TemplateFieldDef = {
  fieldKey: string;
  required: boolean;
  defaultValue?: string | null;
};

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Built-in variables available to every template. */
export function builtInTemplateVariables(now = new Date()): Record<string, string> {
  const iso = now.toISOString();
  return {
    "date.current": iso.slice(0, 10),
    "time.current": iso.slice(11, 19) + "Z",
    "datetime.current": iso,
  };
}

export function extractTemplateVariableKeys(source: string): string[] {
  const keys = new Set<string>();
  const re = new RegExp(VAR_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return [...keys];
}

export function lookupTemplateValue(
  key: string,
  values: Record<string, string | null | undefined>,
): string {
  if (Object.prototype.hasOwnProperty.call(values, key) && values[key] != null) {
    return String(values[key]);
  }
  const flat = key.replace(/\./g, "_");
  if (Object.prototype.hasOwnProperty.call(values, flat) && values[flat] != null) {
    return String(values[flat]);
  }
  return "";
}

/**
 * Replace {{var}} tokens. Unknown keys become empty string (not left as raw mustache).
 * Does not execute expressions — keys only.
 */
export function substituteTemplateVariables(
  source: string,
  values: Record<string, string | null | undefined>,
  options?: { keepUnknown?: boolean },
): string {
  const keepUnknown = options?.keepUnknown === true;
  return String(source ?? "").replace(VAR_RE, (_full, rawKey: string) => {
    const key = String(rawKey ?? "").trim();
    if (!key) return "";
    if (
      Object.prototype.hasOwnProperty.call(values, key) ||
      Object.prototype.hasOwnProperty.call(values, key.replace(/\./g, "_"))
    ) {
      return lookupTemplateValue(key, values);
    }
    return keepUnknown ? `{{${key}}}` : "";
  });
}

export function mergeTemplateFieldValues(input: {
  fields: TemplateFieldDef[];
  fieldValues?: Record<string, string | null | undefined> | null;
  extras?: Record<string, string | null | undefined> | null;
}): Record<string, string> {
  const out: Record<string, string> = { ...builtInTemplateVariables() };
  for (const [k, v] of Object.entries(input.extras ?? {})) {
    if (v != null) out[k] = String(v);
  }
  for (const field of input.fields) {
    const provided = input.fieldValues?.[field.fieldKey];
    if (provided != null && String(provided).length > 0) {
      out[field.fieldKey] = String(provided);
    } else if (field.defaultValue != null && String(field.defaultValue).length > 0) {
      out[field.fieldKey] = String(field.defaultValue);
    }
  }
  for (const [k, v] of Object.entries(input.fieldValues ?? {})) {
    if (v != null && out[k] === undefined) out[k] = String(v);
  }
  return out;
}

export function validateRequiredTemplateFields(input: {
  fields: TemplateFieldDef[];
  values: Record<string, string>;
}): string[] {
  const missing: string[] = [];
  for (const field of input.fields) {
    if (!field.required) continue;
    const v = String(input.values[field.fieldKey] ?? "").trim();
    if (!v) missing.push(field.fieldKey);
  }
  return missing;
}

export function assertTemplateVersionMutable(status: string): void {
  const s = String(status ?? "")
    .trim()
    .toUpperCase();
  if (s !== "DRAFT") {
    throw new Error(`Template version is ${s || "unknown"} and cannot be edited`);
  }
}

export function stripHtmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function layoutKind(layout: Record<string, unknown> | null | undefined): string {
  const kind = String(layout?.kind ?? "")
    .trim()
    .toUpperCase();
  if (kind) return kind;
  if (Array.isArray(layout?.elements) && layout.elements.length > 0) return "ELEMENTS";
  if (typeof layout?.html === "string" && layout.html.trim()) return "HTML";
  return "FIELDS";
}
