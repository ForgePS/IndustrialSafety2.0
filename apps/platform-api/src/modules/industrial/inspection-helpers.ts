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

export function defaultInspectionTitle(departmentName: string, date: Date = new Date()): string {
  const dept = departmentName.trim() || "Inspection";
  return `${formatInspectionTitleDate(date)} ${dept}`;
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
    name:
      textOf(row.name) ||
      textOf(row.title) ||
      textOf(payload.name) ||
      textOf(payload.title) ||
      "Imported template",
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

export function itemsFromTemplate(template: InspectionTemplateDto): InspectionRunItem[] {
  return template.items.map((item) => ({
    ...item,
    answer: null,
    notes: "",
    photos: [],
  }));
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
