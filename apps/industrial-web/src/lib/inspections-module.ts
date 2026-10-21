/**
 * Inspections workspace helpers: template normalization, title defaults,
 * and run/report payloads.
 */

import { apiSend } from "@forge/web-kit";

export type InspectionAnswer = "YES" | "NO" | "NA" | null;

export type InspectionTemplateItem = {
  id: string;
  label: string;
  section?: string;
  required?: boolean;
};

export type InspectionPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
};

export type InspectionRunItem = InspectionTemplateItem & {
  answer: InspectionAnswer;
  notes?: string;
  photos?: InspectionPhoto[];
  photoAttachmentIds?: string[];
  correctiveActionId?: string;
  closeoutUrl?: string;
  closeoutToken?: string;
};

export type InspectionRunPayload = {
  inspectionDate?: string;
  departmentId?: string | null;
  departmentName?: string;
  templateId?: string | null;
  templateName?: string;
  responsiblePersonnelId?: string | null;
  responsibleName?: string;
  items: InspectionRunItem[];
};

export type InspectionTemplate = {
  id: string;
  name: string;
  source: "ehs" | "imported" | "builtin";
  departmentHint?: string | null;
  items: InspectionTemplateItem[];
};

export const FALLBACK_INSPECTION_TEMPLATE: InspectionTemplate = {
  id: "builtin-general-area",
  name: "General area inspection",
  source: "builtin",
  items: [
    { id: "housekeeping", label: "Work area is clean and free of slip/trip hazards", section: "Housekeeping" },
    { id: "exits", label: "Emergency exits and aisles are clear", section: "Emergency" },
    { id: "extinguishers", label: "Fire extinguishers are accessible and inspected", section: "Emergency" },
    { id: "ppe", label: "Required PPE is available and in use", section: "PPE" },
    { id: "guards", label: "Machine guards are in place where required", section: "Equipment" },
    { id: "chemicals", label: "Chemicals are labeled and stored correctly", section: "Chemical" },
    { id: "electrical", label: "Electrical panels and cords are in safe condition", section: "Electrical" },
    { id: "first-aid", label: "First aid supplies are stocked and accessible", section: "Emergency" },
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Drop trailing source labels that got baked into imported template titles. */
export function cleanInspectionTemplateName(name: string): string {
  return name
    .replace(/\s*\((?:imported|ehs|builtin)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugId(prefix: string, label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${base || "item"}-${index + 1}`;
}

/** Format local date as yy-mm-dd for inspection titles. */
export function formatInspectionTitleDate(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Default inspection name: `yy-mm-dd Division, Department`.
 * A bare string is treated as department-only (legacy callers).
 */
export function defaultInspectionTitle(
  input: string | { divisionName?: string | null; departmentName?: string | null },
  date: Date = new Date(),
): string {
  const datePart = formatInspectionTitleDate(date);
  if (typeof input === "string") {
    const dept = input.trim() || "Inspection";
    return `${datePart} ${dept}`;
  }
  const division = String(input.divisionName ?? "").trim();
  const department = String(input.departmentName ?? "").trim();
  if (division && department) return `${datePart} ${division}, ${department}`;
  if (division) return `${datePart} ${division}`;
  if (department) return `${datePart} ${department}`;
  return `${datePart} Inspection`;
}

/** Human label for list/report inspection type (template preferred). */
export function inspectionTypeLabel(row: {
  inspectionType?: string | null;
  templateName?: string | null;
  sourcePayload?: unknown;
}): string {
  const payload =
    row.sourcePayload && typeof row.sourcePayload === "object" && !Array.isArray(row.sourcePayload)
      ? (row.sourcePayload as Record<string, unknown>)
      : {};
  const template =
    String(row.templateName ?? "").trim() ||
    String(payload.templateName ?? "").trim();
  if (template) return template;
  const type = String(row.inspectionType ?? payload.inspectionType ?? "").trim();
  if (!type) return "—";
  return type.replaceAll("_", " ");
}

function pushItem(
  out: InspectionTemplateItem[],
  seen: Set<string>,
  label: string,
  section: string | undefined,
  index: number,
  preferredId?: string,
) {
  const clean = label.trim();
  if (!clean) return;
  const id = preferredId?.trim() || slugId("q", clean, index);
  if (seen.has(id)) {
    const alt = `${id}-${index + 1}`;
    if (seen.has(alt)) return;
    seen.add(alt);
    const item: InspectionTemplateItem = { id: alt, label: clean };
    if (section) item.section = section;
    out.push(item);
    return;
  }
  seen.add(id);
  const item: InspectionTemplateItem = { id, label: clean };
  if (section) item.section = section;
  out.push(item);
}

function collectFromArray(
  list: unknown[],
  out: InspectionTemplateItem[],
  seen: Set<string>,
  section?: string,
) {
  list.forEach((entry) => {
    if (typeof entry === "string") {
      pushItem(out, seen, entry, section, out.length);
      return;
    }
    const row = asRecord(entry);
    if (!row) return;
    const nestedSection =
      textOf(row.section) ||
      textOf(row.category) ||
      textOf(row.title) ||
      textOf(row.name) ||
      section;
    const nestedKeys = ["items", "questions", "checks", "checklist", "fields", "children"] as const;
    let hasNested = false;
    for (const key of nestedKeys) {
      if (Array.isArray(row[key]) && (row[key] as unknown[]).length > 0) {
        hasNested = true;
        collectFromArray(row[key] as unknown[], out, seen, nestedSection || section);
      }
    }
    if (hasNested) return;
    const label =
      textOf(row.label) ||
      textOf(row.text) ||
      textOf(row.question) ||
      textOf(row.prompt) ||
      textOf(row.title) ||
      textOf(row.name) ||
      textOf(row.description);
    const id = textOf(row.id) || textOf(row.key) || textOf(row.code) || undefined;
    if (label) pushItem(out, seen, label, nestedSection || undefined, out.length, id);
  });
}

/** Map legacy Firebase / EHS / form template JSON into a flat checklist. */
export function normalizeInspectionTemplateItems(raw: unknown): InspectionTemplateItem[] {
  const out: InspectionTemplateItem[] = [];
  const seen = new Set<string>();
  if (raw == null) return out;

  if (Array.isArray(raw)) {
    collectFromArray(raw, out, seen);
    return out;
  }

  const root = asRecord(raw);
  if (!root) return out;

  for (const key of [
    "items",
    "questions",
    "checks",
    "checklist",
    "fields",
    "sections",
    "templateItems",
    "inspectionItems",
  ] as const) {
    const value = root[key];
    if (Array.isArray(value)) collectFromArray(value, out, seen);
  }

  // EHS / form schemas often nest sections → questions
  if (Array.isArray(root.schema?.["sections" as never])) {
    collectFromArray(root.schema as unknown as unknown[], out, seen);
  }
  const schema = asRecord(root.schemaJson) ?? asRecord(root.schema) ?? asRecord(root.templateJson);
  if (schema) {
    for (const key of ["sections", "items", "questions", "fields"] as const) {
      if (Array.isArray(schema[key])) collectFromArray(schema[key] as unknown[], out, seen);
    }
  }

  return out;
}

export function templateFromLegacyRow(row: {
  id: string;
  name?: string | null;
  title?: string | null;
  source?: InspectionTemplate["source"];
  departmentHint?: string | null;
  templateJson?: unknown;
  sourcePayload?: unknown;
  schemaJson?: unknown;
}): InspectionTemplate | null {
  const payload = asRecord(row.sourcePayload) ?? {};
  const items = normalizeInspectionTemplateItems(
    row.templateJson ??
      row.schemaJson ??
      payload.templateJson ??
      payload.schemaJson ??
      payload.items ??
      payload.questions ??
      payload.sections ??
      payload.checklist ??
      payload,
  );
  if (items.length === 0) return null;
  const name = cleanInspectionTemplateName(
    textOf(row.name) ||
      textOf(row.title) ||
      textOf(payload.name) ||
      textOf(payload.title) ||
      "Imported template",
  );
  const departmentHint =
    row.departmentHint ||
    textOf(payload.departmentName) ||
    textOf(payload.department) ||
    textOf(payload.area) ||
    null;
  return {
    id: row.id,
    name,
    source: row.source ?? "imported",
    departmentHint,
    items,
  };
}

const SOURCE_RANK: Record<InspectionTemplate["source"], number> = {
  ehs: 0,
  imported: 1,
  builtin: 2,
};

function templateNameKey(name: string): string {
  return cleanInspectionTemplateName(name).toLowerCase().replace(/\s+/g, " ");
}

function preferInspectionTemplate(
  current: InspectionTemplate,
  candidate: InspectionTemplate,
): InspectionTemplate {
  if (candidate.items.length !== current.items.length) {
    return candidate.items.length > current.items.length ? candidate : current;
  }
  return SOURCE_RANK[candidate.source] < SOURCE_RANK[current.source] ? candidate : current;
}

/** Collapse duplicate templates that share an id or the same display name. */
export function dedupeInspectionTemplates(
  templates: readonly InspectionTemplate[],
): InspectionTemplate[] {
  const byId = new Map<string, InspectionTemplate>();
  for (const template of templates) {
    const cleaned: InspectionTemplate = {
      ...template,
      name: cleanInspectionTemplateName(template.name) || template.name,
    };
    const existing = byId.get(cleaned.id);
    byId.set(cleaned.id, existing ? preferInspectionTemplate(existing, cleaned) : cleaned);
  }

  const byName = new Map<string, InspectionTemplate>();
  for (const template of byId.values()) {
    const key = templateNameKey(template.name);
    const existing = byName.get(key);
    byName.set(key, existing ? preferInspectionTemplate(existing, template) : template);
  }

  return [...byName.values()].sort((a, b) => {
    const sourceCmp = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (sourceCmp !== 0) return sourceCmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}

export function itemsFromTemplate(template: InspectionTemplate): InspectionRunItem[] {
  return template.items.map((item) => ({
    ...item,
    answer: null,
    notes: "",
    photos: [],
  }));
}

export function noFindingItems(items: readonly InspectionRunItem[]): InspectionRunItem[] {
  return items.filter((item) => item.answer === "NO");
}

/** Group checklist items by category/section heading (preserves first-seen order). */
export function groupInspectionItemsBySection<T extends { section?: string }>(
  items: readonly T[],
): Array<{ section: string; items: T[] }> {
  const groups: Array<{ section: string; items: T[] }> = [];
  const indexBySection = new Map<string, number>();
  for (const item of items) {
    const section = (item.section ?? "").trim() || "General";
    let idx = indexBySection.get(section);
    if (idx === undefined) {
      idx = groups.length;
      indexBySection.set(section, idx);
      groups.push({ section, items: [] });
    }
    groups[idx]!.items.push(item);
  }
  return groups;
}

export function inspectionNeedsNotes(item: InspectionRunItem): boolean {
  return item.answer === "NO" && !(item.notes ?? "").trim();
}

export function canCompleteInspection(items: readonly InspectionRunItem[]): {
  ok: boolean;
  reason?: string;
} {
  if (items.length === 0) return { ok: false, reason: "Inspection has no checklist items." };
  if (items.some((item) => item.answer == null)) {
    return { ok: false, reason: "Answer every checklist item before completing." };
  }
  const missingNotes = items.filter(inspectionNeedsNotes);
  if (missingNotes.length > 0) {
    return {
      ok: false,
      reason: `Add notes for ${missingNotes.length} No finding${missingNotes.length === 1 ? "" : "s"}.`,
    };
  }
  return { ok: true };
}

export function parseInspectionRun(record: Record<string, unknown>): InspectionRunPayload {
  const payload = asRecord(record.sourcePayload) ?? record;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items: InspectionRunItem[] = rawItems.map((entry, index) => {
    const row = asRecord(entry) ?? {};
    const answerRaw = textOf(row.answer).toUpperCase();
    const answer: InspectionAnswer =
      answerRaw === "YES" || answerRaw === "NO" || answerRaw === "NA" ? answerRaw : null;
    const photos = Array.isArray(row.photos)
      ? row.photos
          .map((photo) => {
            const p = asRecord(photo);
            if (!p) return null;
            const dataUrl = textOf(p.dataUrl);
            if (!dataUrl.startsWith("data:")) return null;
            return {
              id: textOf(p.id) || `photo-${index}-${Math.random().toString(36).slice(2, 8)}`,
              fileName: textOf(p.fileName) || "photo.jpg",
              contentType: textOf(p.contentType) || "image/jpeg",
              dataUrl,
            } satisfies InspectionPhoto;
          })
          .filter((p): p is InspectionPhoto => Boolean(p))
      : [];
    const section = textOf(row.section);
    const correctiveActionId = textOf(row.correctiveActionId);
    const closeoutUrl = textOf(row.closeoutUrl);
    const closeoutToken = textOf(row.closeoutToken);
    const item: InspectionRunItem = {
      id: textOf(row.id) || `item-${index + 1}`,
      label: textOf(row.label) || `Item ${index + 1}`,
      required: row.required === true,
      answer,
      notes: textOf(row.notes),
      photos,
      photoAttachmentIds: Array.isArray(row.photoAttachmentIds)
        ? row.photoAttachmentIds.map(String)
        : [],
    };
    if (section) item.section = section;
    if (correctiveActionId) item.correctiveActionId = correctiveActionId;
    if (closeoutUrl) item.closeoutUrl = closeoutUrl;
    if (closeoutToken) item.closeoutToken = closeoutToken;
    return item;
  });

  const result: InspectionRunPayload = {
    departmentId: textOf(payload.departmentId) || (record.departmentId as string) || null,
    departmentName: textOf(payload.departmentName),
    templateId: textOf(payload.templateId) || (record.templateId as string) || null,
    templateName: textOf(payload.templateName),
    responsiblePersonnelId: textOf(payload.responsiblePersonnelId) || null,
    responsibleName: textOf(payload.responsibleName),
    items,
  };
  const inspectionDate = textOf(payload.inspectionDate);
  if (inspectionDate) result.inspectionDate = inspectionDate;
  return result;
}

export function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "CLOSED") return "bg-label-success";
  if (s === "IN_PROGRESS" || s === "OPEN" || s === "ACTIVE") return "bg-label-primary";
  if (s === "DRAFT") return "bg-label-secondary";
  return "bg-label-warning";
}

export type InspectionTemplateImportResult = {
  template: InspectionTemplate;
  created: boolean;
  updated: boolean;
  itemCount: number;
};

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Upload Excel/CSV/PDF and create a digital inspection template. */
export async function importInspectionTemplateFile(
  file: File,
  overrides?: { title?: string; departmentHint?: string; preview?: boolean },
): Promise<InspectionTemplateImportResult> {
  const contentBase64 = await readFileAsBase64(file);
  return apiSend<InspectionTemplateImportResult>(
    "/api/v1/industrial/inspection-templates/import-file",
    "POST",
    {
      filename: file.name,
      contentBase64,
      ...(overrides?.title?.trim() ? { title: overrides.title.trim() } : {}),
      ...(overrides?.departmentHint?.trim()
        ? { departmentHint: overrides.departmentHint.trim() }
        : {}),
      ...(overrides?.preview ? { preview: true } : {}),
    },
  );
}

/** Rename a digital inspection template. */
export async function renameInspectionTemplate(
  templateId: string,
  name: string,
): Promise<InspectionTemplate> {
  return apiSend<InspectionTemplate>(
    `/api/v1/industrial/inspection-templates/${encodeURIComponent(templateId)}`,
    "PATCH",
    { name },
  );
}
