/**
 * Server-side inspection template normalization and title helpers.
 * Kept in platform-api to avoid a cross-package dependency for MVP.
 */

export type InspectionAnswer = "YES" | "NO" | "NA" | null;

export type InspectionTemplateItem = {
  id: string;
  label: string;
  section?: string;
  required?: boolean;
};

export type InspectionRunItem = InspectionTemplateItem & {
  answer: InspectionAnswer;
  notes?: string;
  photos?: Array<{ id: string; fileName: string; contentType: string; dataUrl: string }>;
  photoAttachmentIds?: string[];
  correctiveActionId?: string;
  closeoutUrl?: string;
  closeoutToken?: string;
};

export type InspectionTemplateDto = {
  id: string;
  name: string;
  source: "ehs" | "imported" | "builtin";
  departmentHint?: string | null;
  items: InspectionTemplateItem[];
};

export const FALLBACK_INSPECTION_TEMPLATE: InspectionTemplateDto = {
  id: "builtin-general-area",
  name: "General area inspection",
  source: "builtin",
  items: [
    {
      id: "housekeeping",
      label: "Work area is clean and free of slip/trip hazards",
      section: "Housekeeping",
    },
    { id: "exits", label: "Emergency exits and aisles are clear", section: "Emergency" },
    {
      id: "extinguishers",
      label: "Fire extinguishers are accessible and inspected",
      section: "Emergency",
    },
    { id: "ppe", label: "Required PPE is available and in use", section: "PPE" },
    { id: "guards", label: "Machine guards are in place where required", section: "Equipment" },
    { id: "chemicals", label: "Chemicals are labeled and stored correctly", section: "Chemical" },
    {
      id: "electrical",
      label: "Electrical panels and cords are in safe condition",
      section: "Electrical",
    },
    {
      id: "first-aid",
      label: "First aid supplies are stocked and accessible",
      section: "Emergency",
    },
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

export function formatInspectionTitleDate(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
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

function pushItem(
  out: InspectionTemplateItem[],
  seen: Set<string>,
  label: string,
  section: string | undefined,
  preferredId?: string,
) {
  const clean = label.trim();
  if (!clean) return;
  const id = preferredId?.trim() || slugId("q", clean, out.length);
  if (seen.has(id)) {
    const alt = `${id}-${out.length + 1}`;
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
  for (const entry of list) {
    if (typeof entry === "string") {
      pushItem(out, seen, entry, section);
      continue;
    }
    const row = asRecord(entry);
    if (!row) continue;
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
    if (hasNested) continue;
    const label =
      textOf(row.label) ||
      textOf(row.text) ||
      textOf(row.question) ||
      textOf(row.prompt) ||
      textOf(row.title) ||
      textOf(row.name) ||
      textOf(row.description);
    const id = textOf(row.id) || textOf(row.key) || textOf(row.code) || undefined;
    if (label) pushItem(out, seen, label, nestedSection || undefined, id);
  }
}

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
    if (Array.isArray(root[key])) collectFromArray(root[key] as unknown[], out, seen);
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
  source?: InspectionTemplateDto["source"];
  departmentHint?: string | null;
  templateJson?: unknown;
  sourcePayload?: unknown;
  schemaJson?: unknown;
}): InspectionTemplateDto | null {
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
  return {
    id: row.id,
    name: cleanInspectionTemplateName(
      textOf(row.name) ||
        textOf(row.title) ||
        textOf(payload.name) ||
        textOf(payload.title) ||
        "Imported template",
    ),
    source: row.source ?? "imported",
    departmentHint:
      row.departmentHint ||
      textOf(payload.departmentName) ||
      textOf(payload.department) ||
      textOf(payload.area) ||
      null,
    items,
  };
}

const SOURCE_RANK: Record<InspectionTemplateDto["source"], number> = {
  ehs: 0,
  imported: 1,
  builtin: 2,
};

function templateNameKey(name: string): string {
  return cleanInspectionTemplateName(name).toLowerCase().replace(/\s+/g, " ");
}

function preferInspectionTemplate(
  current: InspectionTemplateDto,
  candidate: InspectionTemplateDto,
): InspectionTemplateDto {
  if (candidate.items.length !== current.items.length) {
    return candidate.items.length > current.items.length ? candidate : current;
  }
  return SOURCE_RANK[candidate.source] < SOURCE_RANK[current.source] ? candidate : current;
}

/**
 * Collapse duplicate templates that share an id or the same display name
 * (common when the same checklist was imported as both a form definition and
 * an inspectionTemplates row).
 */
export function dedupeInspectionTemplates(
  templates: readonly InspectionTemplateDto[],
): InspectionTemplateDto[] {
  const byId = new Map<string, InspectionTemplateDto>();
  for (const template of templates) {
    const cleaned: InspectionTemplateDto = {
      ...template,
      name: cleanInspectionTemplateName(template.name) || template.name,
    };
    const existing = byId.get(cleaned.id);
    byId.set(cleaned.id, existing ? preferInspectionTemplate(existing, cleaned) : cleaned);
  }

  const byName = new Map<string, InspectionTemplateDto>();
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

export function itemsFromTemplate(template: InspectionTemplateDto): InspectionRunItem[] {
  return template.items.map((item) => ({
    ...item,
    answer: null,
    notes: "",
    photos: [],
  }));
}

/** Map Yes/No checklist import fields into inspection template items. */
export function checklistFieldsToInspectionItems(
  fields: ReadonlyArray<{ id?: string; label: string; section?: string; required?: boolean }>,
): InspectionTemplateItem[] {
  const out: InspectionTemplateItem[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const before = out.length;
    pushItem(out, seen, field.label, field.section, field.id?.trim() || undefined);
    if (out.length > before) {
      out[out.length - 1]!.required = field.required !== false;
    }
  }
  return out;
}

export function parseRunItems(raw: unknown): InspectionRunItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
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
              id: textOf(p.id) || `photo-${index}`,
              fileName: textOf(p.fileName) || "photo.jpg",
              contentType: textOf(p.contentType) || "image/jpeg",
              dataUrl,
            };
          })
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
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
}

export function assertCanComplete(items: InspectionRunItem[]): void {
  if (items.length === 0) {
    throw new Error("Inspection has no checklist items.");
  }
  if (items.some((item) => item.answer == null)) {
    throw new Error("Answer every checklist item before completing.");
  }
  const missing = items.filter((item) => item.answer === "NO" && !(item.notes ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`Add notes for ${missing.length} No finding(s).`);
  }
}
