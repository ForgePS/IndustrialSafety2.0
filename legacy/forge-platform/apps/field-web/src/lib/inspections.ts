export type InspectionAnswer = "YES" | "NO" | "NA" | null;

export type InspectionPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  /** Preserved when markup is applied — original is never overwritten. */
  originalDataUrl?: string;
  hasMarkup?: boolean;
  markupDocument?: unknown;
};

export type InspectionTemplateItem = {
  id: string;
  label: string;
  section?: string;
  required?: boolean;
  critical?: boolean;
};

export type InspectionRunItem = InspectionTemplateItem & {
  answer: InspectionAnswer;
  notes?: string;
  photos?: InspectionPhoto[];
  photoAttachmentIds?: string[];
  correctiveActionId?: string;
  closeoutUrl?: string;
};

export type InspectionTemplate = {
  id: string;
  name: string;
  source?: string;
  departmentHint?: string | null;
  items: InspectionTemplateItem[];
};

export const FALLBACK_INSPECTION_TEMPLATE: InspectionTemplate = {
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

export function itemsFromTemplate(template: InspectionTemplate): InspectionRunItem[] {
  return template.items.map((item) => ({
    ...item,
    answer: null,
    notes: "",
    photos: [],
  }));
}

export function canCompleteInspection(items: readonly InspectionRunItem[]): {
  ok: boolean;
  reason?: string;
} {
  if (items.length === 0) return { ok: false, reason: "Inspection has no checklist items." };
  if (items.some((item) => item.answer == null)) {
    return { ok: false, reason: "Answer every checklist item before completing." };
  }
  const missingNotes = items.filter((item) => item.answer === "NO" && !(item.notes ?? "").trim());
  if (missingNotes.length > 0) {
    return {
      ok: false,
      reason: `Add notes for ${missingNotes.length} No finding${missingNotes.length === 1 ? "" : "s"}.`,
    };
  }
  return { ok: true };
}

export function answeredCount(items: readonly InspectionRunItem[]): number {
  return items.filter((item) => item.answer != null).length;
}

export function deficiencyCount(items: readonly InspectionRunItem[]): number {
  return items.filter((item) => item.answer === "NO").length;
}

export function isCriticalInspectionItem(
  item: Pick<InspectionTemplateItem, "critical" | "label" | "section">,
): boolean {
  if (item.critical === true) return true;
  if (/\bcritical\b/i.test(item.label)) return true;
  if (item.section && /\bcritical\b/i.test(item.section)) return true;
  return false;
}

export function criticalDeficiencyCount(items: readonly InspectionRunItem[]): number {
  return items.filter((item) => item.answer === "NO" && isCriticalInspectionItem(item)).length;
}

export function findingsFromItems(items: readonly InspectionRunItem[]): InspectionRunItem[] {
  return items.filter((item) => item.answer === "NO");
}

export function photoCount(items: readonly InspectionRunItem[]): number {
  return items.reduce((sum, item) => sum + (item.photos?.length ?? 0), 0);
}

export function hasInspectorSignature(signature: string | null | undefined): boolean {
  const value = (signature ?? "").trim();
  if (!value) return false;
  if (value.startsWith("typed:")) return value.length > "typed:".length;
  return value.startsWith("data:") || value.length > 2;
}

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

export function parseInspectionItems(raw: unknown): InspectionRunItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const row = asRecord(entry) ?? {};
    const answerRaw = textOf(row.answer).toUpperCase();
    const answer: InspectionAnswer =
      answerRaw === "YES" || answerRaw === "NO" || answerRaw === "NA" ? answerRaw : null;
    const photos = Array.isArray(row.photos)
      ? row.photos
          .map((entry) => {
            const p = asRecord(entry);
            if (!p) return null;
            const dataUrl = textOf(p.dataUrl);
            if (!dataUrl.startsWith("data:")) return null;
            const photo: InspectionPhoto = {
              id: textOf(p.id) || `photo-${index}`,
              fileName: textOf(p.fileName) || "photo.jpg",
              contentType: textOf(p.contentType) || "image/jpeg",
              dataUrl,
            };
            const originalDataUrl = textOf(p.originalDataUrl);
            if (originalDataUrl.startsWith("data:")) photo.originalDataUrl = originalDataUrl;
            if (p.hasMarkup === true) photo.hasMarkup = true;
            if (p.markupDocument && typeof p.markupDocument === "object") {
              photo.markupDocument = p.markupDocument;
            }
            return photo;
          })
          .filter((p): p is InspectionPhoto => Boolean(p))
      : [];
    const section = textOf(row.section);
    const item: InspectionRunItem = {
      id: textOf(row.id) || `item-${index + 1}`,
      label: textOf(row.label) || `Item ${index + 1}`,
      required: row.required === true,
      answer,
      notes: textOf(row.notes),
      photos,
    };
    if (section) item.section = section;
    if (row.critical === true || isCriticalInspectionItem(item)) item.critical = true;
    const attachmentIds = Array.isArray(row.photoAttachmentIds)
      ? row.photoAttachmentIds.map((id) => String(id)).filter(Boolean)
      : [];
    if (attachmentIds.length) item.photoAttachmentIds = attachmentIds;
    const ca = textOf(row.correctiveActionId);
    const closeout = textOf(row.closeoutUrl);
    if (ca) item.correctiveActionId = ca;
    if (closeout) item.closeoutUrl = closeout;
    return item;
  });
}

export function normalizeTemplateRow(row: Record<string, unknown>): InspectionTemplate | null {
  const payload = asRecord(row.sourcePayload) ?? {};
  const rawItems =
    row.items ??
    payload.items ??
    payload.questions ??
    payload.checklist ??
    row.templateJson ??
    payload.templateJson;
  let items: InspectionTemplateItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems
      .map((entry, index) => {
        if (typeof entry === "string") {
          return { id: `q-${index + 1}`, label: entry };
        }
        const r = asRecord(entry);
        if (!r) return null;
        const label =
          textOf(r.label) ||
          textOf(r.text) ||
          textOf(r.question) ||
          textOf(r.title) ||
          textOf(r.name);
        if (!label) return null;
        const section = textOf(r.section) || textOf(r.category) || undefined;
        const item: InspectionTemplateItem = {
          id: textOf(r.id) || `q-${index + 1}`,
          label,
          required: r.required === true,
        };
        if (section) item.section = section;
        if (r.critical === true || isCriticalInspectionItem(item)) item.critical = true;
        return item;
      })
      .filter((item): item is InspectionTemplateItem => Boolean(item));
  }
  if (items.length === 0) return null;
  return {
    id: textOf(row.id) || "template",
    name: textOf(row.name) || textOf(row.title) || textOf(payload.name) || "Inspection",
    source: textOf(row.source) || "imported",
    departmentHint: textOf(row.departmentHint) || textOf(payload.departmentName) || null,
    items,
  };
}

export async function compressImageFile(
  file: File,
  maxDim = 1280,
  quality = 0.72,
): Promise<InspectionPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      id: crypto.randomUUID(),
      fileName: file.name || "photo.jpg",
      contentType: file.type || "image/jpeg",
      dataUrl,
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  return {
    id: crypto.randomUUID(),
    fileName: file.name || "photo.jpg",
    contentType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", quality),
  };
}

const DRAFT_PREFIX = "forge.field.inspection.draft.v1:";

export function saveInspectionDraft(inspectionId: string, items: InspectionRunItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${inspectionId}`,
      JSON.stringify({ items, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore quota
  }
}

export function loadInspectionDraft(inspectionId: string): InspectionRunItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${inspectionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = parseInspectionItems(parsed.items);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

export function clearInspectionDraft(inspectionId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${DRAFT_PREFIX}${inspectionId}`);
}

export type InspectionHubTab = "assigned" | "dueToday" | "upcoming" | "overdue" | "completed";

export type InspectionListRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sourcePayload?: Record<string, unknown> | null;
  dueAt?: string | null;
  divisionName?: string | null;
  locationName?: string | null;
  locationId?: string | null;
  templateName?: string | null;
};

function payloadOf(record: InspectionListRecord): Record<string, unknown> {
  return asRecord(record.sourcePayload) ?? {};
}

export function inspectionDueAt(record: InspectionListRecord): string | null {
  const payload = payloadOf(record);
  return (
    textOf(record.dueAt) ||
    textOf(payload.dueAt) ||
    textOf(payload.dueDate) ||
    textOf(payload.scheduledFor) ||
    null
  );
}

export function inspectionLocationId(record: InspectionListRecord): string | null {
  const payload = payloadOf(record);
  return (
    textOf(record.locationId) ||
    textOf(record.siteId) ||
    textOf(payload.siteId) ||
    textOf(payload.locationId) ||
    null
  );
}

export function inspectionLocationName(record: InspectionListRecord): string | null {
  const payload = payloadOf(record);
  return (
    textOf(record.locationName) || textOf(payload.locationName) || textOf(payload.siteName) || null
  );
}

export function inspectionDivisionName(record: InspectionListRecord): string | null {
  const payload = payloadOf(record);
  return (
    textOf(record.divisionName) || textOf(payload.divisionName) || textOf(payload.division) || null
  );
}

export function isInspectionCompleted(status: string | null | undefined): boolean {
  return /complete|passed|done|closed/i.test(String(status ?? ""));
}

export function filterInspectionsForHub(
  records: readonly InspectionListRecord[],
  tab: InspectionHubTab,
  now = new Date(),
): InspectionListRecord[] {
  if (tab === "completed") {
    return records.filter((row) => isInspectionCompleted(row.status));
  }
  const open = records.filter((row) => !isInspectionCompleted(row.status));
  if (tab === "assigned") return open;
  return open.filter((row) => {
    const due = inspectionDueAt(row);
    if (!due) return false;
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return false;
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const eod = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    const t = d.getTime();
    const bucket = t < now.getTime() ? "overdue" : t >= sod && t <= eod ? "dueToday" : "upcoming";
    if (tab === "overdue") return bucket === "overdue";
    if (tab === "dueToday") return bucket === "dueToday" || bucket === "overdue";
    if (tab === "upcoming") return bucket === "upcoming";
    return false;
  });
}

export function filterInspectionsForOrg(
  records: readonly InspectionListRecord[],
  opts: { locationId?: string | null; divisionName?: string | null },
): InspectionListRecord[] {
  return records.filter((row) => {
    if (opts.locationId) {
      const loc = inspectionLocationId(row);
      if (loc && loc !== opts.locationId) return false;
    }
    if (opts.divisionName) {
      const div = inspectionDivisionName(row);
      if (div && div !== opts.divisionName) return false;
    }
    return true;
  });
}

/** Map an inspection API row into a My Work card shape. */
export function inspectionToWorkItem(record: InspectionListRecord): {
  kind: "inspection";
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  priority: string | null;
  status: string;
  estimatedMinutes: number | null;
  href: string;
  locationId: string | null;
  locationName: string | null;
  divisionName: string | null;
  departmentName: string | null;
} {
  const payload = payloadOf(record);
  const findings = deficiencyCount(
    parseInspectionItems(payload.items ?? record.sourcePayload?.items),
  );
  const critical = criticalDeficiencyCount(
    parseInspectionItems(payload.items ?? record.sourcePayload?.items),
  );
  return {
    kind: "inspection",
    id: record.id,
    title: textOf(record.title) || textOf(payload.title) || "Inspection",
    subtitle:
      textOf(record.templateName) ||
      textOf(payload.templateName) ||
      (findings > 0 ? `${findings} finding${findings === 1 ? "" : "s"}` : null),
    dueAt: inspectionDueAt(record),
    priority: critical > 0 ? "CRITICAL" : null,
    status: textOf(record.status) || "IN_PROGRESS",
    estimatedMinutes: null,
    href: `/inspection/${encodeURIComponent(record.id)}/`,
    locationId: inspectionLocationId(record),
    locationName: inspectionLocationName(record),
    divisionName: inspectionDivisionName(record),
    departmentName: textOf(payload.departmentName) || null,
  };
}
