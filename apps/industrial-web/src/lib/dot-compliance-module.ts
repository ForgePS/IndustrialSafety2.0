/** DOT Compliance module — categories, status helpers, and summary tiles. */

import { deriveDotDqfTitle } from "./dot-dqf-fields";

export type DotCategory =
  | "drivers"
  | "vehicles"
  | "dvirs"
  | "roadside"
  | "accidents"
  | "drug-alcohol"
  | "company"
  | "other";

export type DotTabId = "dashboard" | "reports" | DotCategory;

export const DOT_RECORD_CATEGORIES: ReadonlyArray<DotCategory> = [
  "drivers",
  "vehicles",
  "dvirs",
  "roadside",
  "accidents",
  "drug-alcohol",
  "company",
  "other",
];

export const DOT_TABS: ReadonlyArray<{ id: DotTabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "drivers", label: "DRIVERS (DQF)" },
  { id: "vehicles", label: "Vehicles" },
  { id: "dvirs", label: "DVIRs" },
  { id: "roadside", label: "Roadside" },
  { id: "accidents", label: "Accidents" },
  { id: "drug-alcohol", label: "Drug & Alcohol" },
  { id: "company", label: "Company" },
  { id: "other", label: "Other" },
  { id: "reports", label: "Reports" },
];

export const DOT_TAB_META: Record<DotTabId, { label: string; description: string; icon: string }> =
  {
    dashboard: {
      label: "Dashboard",
      description: "Compliance score, open items, and quick links by record type.",
      icon: "bx-grid-alt",
    },
    drivers: {
      label: "DRIVERS (DQF)",
      description:
        "DRIVER Qualification Files — licenses, MVR, medical cards, and related documents.",
      icon: "bx-user",
    },
    vehicles: {
      label: "Vehicles",
      description: "Vehicle registrations, inspections, and fleet DOT documentation.",
      icon: "bx-car",
    },
    dvirs: {
      label: "DVIRs",
      description: "DRIVER Vehicle Inspection Reports — pre-trip, post-trip, and defect follow-up.",
      icon: "bx-clipboard",
    },
    roadside: {
      label: "Roadside",
      description: "Roadside inspection results, violations, and out-of-service items.",
      icon: "bx-map",
    },
    accidents: {
      label: "Accidents",
      description: "DOT-recordable accidents, crash reports, and related follow-up.",
      icon: "bx-error",
    },
    "drug-alcohol": {
      label: "Drug & Alcohol",
      description: "Drug and alcohol testing, clearings, and DAPM program records.",
      icon: "bx-plus-medical",
    },
    company: {
      label: "Company",
      description: "Company-level DOT policies, registrations, and program files.",
      icon: "bx-buildings",
    },
    other: {
      label: "Other",
      description: "Records that do not match a standard DOT category.",
      icon: "bx-folder",
    },
    reports: {
      label: "Reports",
      description:
        "Export DQF document status across the DRIVER roster — missing, expired, expiring, and copy-on-file.",
      icon: "bx-export",
    },
  };

export const DOT_API = "/api/v1/industrial/dot";
export const DOT_LIST_HREF = "/modules/dot-compliance/";

/** DOT file for one record. Ids stay in the query string (static export). */
export function dotFileHref(id: string, opts?: { focus?: string; edit?: boolean }): string {
  const params = new URLSearchParams({ id });
  if (opts?.focus?.trim()) params.set("focus", opts.focus.trim());
  if (opts?.edit) params.set("edit", "1");
  return `/modules/dot-compliance/file/?${params.toString()}`;
}

export function dotListHref(tab?: DotTabId): string {
  if (!tab || tab === "dashboard") return DOT_LIST_HREF;
  return `${DOT_LIST_HREF}?tab=${encodeURIComponent(tab)}`;
}

export function parseDotTab(raw: string | null | undefined): DotTabId {
  if (raw && DOT_TABS.some((tab) => tab.id === raw)) return raw as DotTabId;
  return "dashboard";
}

export function isDotCategoryTab(tab: DotTabId): tab is DotCategory {
  return (DOT_RECORD_CATEGORIES as readonly string[]).includes(tab);
}

function haystackForCategory(row: Record<string, unknown>): string {
  return [
    row.category,
    row.sourceCollection,
    row.sourcePath,
    row.source_collection,
    row.source_path,
    row.sourceDocumentId,
    row.source_document_id,
    row.title,
    row.recordType,
    row.type,
    row.seededFrom,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

/** Company-vehicle / insurance roster rows were seeded into DOT by mistake. */
export function isDotCompanyDriverSource(row: Record<string, unknown>): boolean {
  const seeded = String(row.seededFrom ?? "").toLowerCase();
  const collection = String(row.sourceCollection ?? row.source_collection ?? "").toLowerCase();
  const path = String(row.sourcePath ?? row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) {
    return true;
  }
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") {
    return true;
  }
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

/** True DQF files (DRV- numbers / DQF import), not the company-driver roster. */
export function isDotDqfDriverRecord(row: Record<string, unknown>): boolean {
  if (isDotCompanyDriverSource(row)) return false;
  const hay = haystackForCategory(row);
  if (/\bdrv-\d{4}-\d+\b/.test(hay)) return true;
  if (/dqf\s*import/.test(hay)) return true;
  if (/dot-compliance\/[^/]+\/drivers\/drv-/.test(hay)) return true;
  const cat = String(row.category ?? "")
    .trim()
    .toLowerCase();
  if (cat.includes("dqf")) return true;
  if (row.dqf === true) return true;
  return false;
}

export function dotRecordCategory(row: Record<string, unknown>): DotCategory {
  const hay = haystackForCategory(row);

  if (/\bdvirs?\b|pre[-\s]?trip|post[-\s]?trip|vehicle inspection report/.test(hay)) {
    return "dvirs";
  }
  if (/\broadside\b|out[-\s]?of[-\s]?service|\boos\b|level (i|ii|iii) inspection/.test(hay)) {
    return "roadside";
  }
  if (/\baccidents?\b|\bcrashes?\b|\bcollisions?\b/.test(hay)) {
    return "accidents";
  }
  if (/drug\s*(&|and)?\s*alcohol|\bdapm\b|\bda\b testing|\bclearinghouse\b/.test(hay)) {
    return "drug-alcohol";
  }

  if (isDotCompanyDriverSource(row)) {
    return "other";
  }

  if (isDotDqfDriverRecord(row)) return "drivers";

  const cat = String(row.category ?? "")
    .trim()
    .toLowerCase();
  if (cat.includes("driver") || cat.includes("dqf")) return "other";
  if (cat.includes("vehicle")) return "vehicles";
  if (cat.includes("company")) return "company";

  const collection = String(
    row.sourceCollection ?? row.sourcePath ?? row.source_collection ?? "",
  ).toLowerCase();
  if (collection.includes("dqf")) return "drivers";
  if (collection.includes("driver") && !collection.includes("companyvehicle")) return "other";
  if (collection.includes("vehicle")) return "vehicles";
  if (collection.includes("company")) return "company";

  return "other";
}

export function emptyDotCategoryCounts(): Record<DotCategory, number> {
  return {
    drivers: 0,
    vehicles: 0,
    dvirs: 0,
    roadside: 0,
    accidents: 0,
    "drug-alcohol": 0,
    company: 0,
    other: 0,
  };
}

export function dotWorkerName(row: Record<string, unknown>): string {
  return String(row.workerName ?? row.driverName ?? row.personnelName ?? "").trim();
}

function isMissingDotRecordTitle(row: Record<string, unknown>): boolean {
  const title = String(row.title ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!title) return true;
  return id !== "" && title === id;
}

/** Title shown in DOT lists and breadcrumbs; auto-derived for DQF drivers when blank. */
export function dotRecordTitle(row: Record<string, unknown>): string {
  if (!isMissingDotRecordTitle(row)) return String(row.title).trim();
  if (isDotDqfDriverRecord(row) || dotRecordCategory(row) === "drivers") {
    const derived = deriveDotDqfTitle(row);
    if (derived) return derived;
  }
  const fallback = dotDisplayName(row);
  return fallback || "Untitled";
}

export function dotPersonnelId(row: Record<string, unknown>): string {
  return String(row.personnelId ?? "").trim();
}

/** Name shown on the DOT file header and used to match a person across records. */
export function dotDisplayName(row: Record<string, unknown>): string {
  const worker = dotWorkerName(row);
  if (worker) return worker;
  if (isDotDqfDriverRecord(row) || dotRecordCategory(row) === "drivers") {
    const derived = deriveDotDqfTitle(row);
    if (derived) return derived;
  }
  const title = String(row.title ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (title && title !== id) return title;
  return String(row.displayName ?? row.name ?? "").trim();
}

/**
 * Canonical person name for matching: case, punctuation, and "Last, First"
 * all collapse to the same key so duplicate DQF rows become one profile.
 */
export function normalizeDotPersonName(value: string): string {
  const normalized = safeUnicodeNormalize(value);
  const cleaned = normalized
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.'"]/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned.includes(",")) return cleaned;
  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length < 2) return cleaned.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return `${parts.slice(1).join(" ")} ${parts[0]!}`.replace(/\s+/g, " ").trim();
}

function safeUnicodeNormalize(value: string): string {
  try {
    return value.normalize("NFKD");
  } catch {
    return value.replace(/[\uD800-\uDFFF]/g, "");
  }
}

/** True when an id is a Postgres uuid (personnel / module record deep link). */
export function isIndustrialRecordUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function isFilledDotValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function isDotPersonRecord(row: Record<string, unknown>): boolean {
  return dotRecordCategory(row) === "drivers" || dotWorkerName(row) !== "";
}

function makeUnionFind(ids: readonly string[]) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current !== id) {
      const root = find(current);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  return { find, union };
}

/** Groups records that share a personnel id, employee number, or person name. */
export function groupDotProfileMembers(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[][] {
  const byId = new Map<string, Record<string, unknown>>();
  let anon = 0;
  for (const row of rows) {
    const id = String(row.id ?? "").trim() || `__anon:${anon++}`;
    byId.set(id, row);
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return [];
  const uf = makeUnionFind(ids);
  const buckets = new Map<string, string[]>();

  const add = (key: string, id: string) => {
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  };

  for (const [id, row] of byId) {
    const pid = dotPersonnelId(row);
    if (pid) add(`pid:${pid}`, id);
    const employee = String(row.employeeNumber ?? "")
      .trim()
      .toLowerCase();
    if (employee) add(`emp:${employee}`, id);
    if (isDotPersonRecord(row)) {
      const name = normalizeDotPersonName(dotDisplayName(row));
      if (name) add(`name:${name}`, id);
    }
  }

  for (const list of buckets.values()) {
    for (let i = 1; i < list.length; i += 1) uf.union(list[0]!, list[i]!);
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const id of ids) {
    const root = uf.find(id);
    const group = groups.get(root) ?? [];
    group.push(byId.get(id)!);
    groups.set(root, group);
  }
  return [...groups.values()];
}

export function pickCanonicalDotRecord(
  records: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return [...records].sort((a, b) => {
    const aDriver = dotRecordCategory(a) === "drivers" ? 0 : 1;
    const bDriver = dotRecordCategory(b) === "drivers" ? 0 : 1;
    if (aDriver !== bDriver) return aDriver - bDriver;
    const aPid = dotPersonnelId(a) ? 0 : 1;
    const bPid = dotPersonnelId(b) ? 0 : 1;
    if (aPid !== bPid) return aPid - bPid;
    const aEmp = String(a.employeeNumber ?? "").trim() ? 0 : 1;
    const bEmp = String(b.employeeNumber ?? "").trim() ? 0 : 1;
    if (aEmp !== bEmp) return aEmp - bEmp;
    return collate(String(a.id ?? ""), String(b.id ?? ""));
  })[0];
}

export function mergeDotProfileRecords(
  records: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const sorted = [...records].sort(
    (a, b) =>
      collate(String(a.updatedAt ?? ""), String(b.updatedAt ?? "")) ||
      collate(String(a.id ?? ""), String(b.id ?? "")),
  );
  const merged: Record<string, unknown> = {};
  for (const record of sorted) {
    for (const [key, value] of Object.entries(record)) {
      if (key === "id" || key === "profileRecordCount") continue;
      if (isFilledDotValue(value)) merged[key] = value;
    }
  }
  const openMember = records.find((row) => isDotRecordOpen(String(row.status ?? "")));
  if (openMember) merged.status = openMember.status;
  const canonical = pickCanonicalDotRecord(records);
  merged.id = canonical ? String(canonical.id) : String(sorted.at(-1)?.id ?? "");
  merged.profileRecordCount = records.length;
  const heading = dotDisplayName(merged) || (canonical ? dotDisplayName(canonical) : "");
  if (heading) {
    merged.title = heading;
    merged.workerName = heading;
    merged.displayName = heading;
  }
  return merged;
}

export function dotProfileMembers(
  row: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const id = String(row.id ?? "").trim();
  const groups = groupDotProfileMembers(id ? [...records, row] : records);
  const group = groups.find((members) => members.some((member) => String(member.id) === id));
  return group ?? [row];
}

/** True DOT DQF driver files for lists, counts, and attention — not company-driver roster rows. */
export function filterDotDqfDriverRows(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.filter((row) => isDotDqfDriverRecord(row));
}

export function collapseDotDriverProfiles(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return groupDotProfileMembers(rows)
    .map((members) => members.filter((row) => isDotDqfDriverRecord(row)))
    .filter((members) => members.length > 0)
    .map((members) => mergeDotProfileRecords(members));
}

/**
 * Clicking a person's name should open their Drivers (DQF) file when one
 * exists, not the vehicle/accident row they appeared on.
 */
export function resolveDotFileRecord(
  row: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const members = dotProfileMembers(row, records);
  const drivers = members.filter((candidate) => dotRecordCategory(candidate) === "drivers");
  return pickCanonicalDotRecord(drivers) ?? pickCanonicalDotRecord(members) ?? row;
}

/** Other DOT records for the same person that are not duplicate DQF rows. */
export function relatedDotRecords(
  record: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const id = String(record.id ?? "");
  const members = dotProfileMembers(record, records).filter((row) => String(row.id) !== id);
  if (dotRecordCategory(record) === "drivers") {
    return members.filter((row) => dotRecordCategory(row) !== "drivers");
  }
  const others = members.filter((row) => dotRecordCategory(row) !== "drivers");
  const drivers = collapseDotDriverProfiles(
    members.filter((row) => dotRecordCategory(row) === "drivers"),
  );
  return [...drivers, ...others];
}

/** Combined DQF profile plus related (non-duplicate) DOT records. */
export function buildDotProfileView(
  record: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): { record: Record<string, unknown>; related: Record<string, unknown>[] } {
  const members = dotProfileMembers(record, records);
  if (dotRecordCategory(record) !== "drivers") {
    return { record, related: members.filter((row) => String(row.id) !== String(record.id)) };
  }
  const drivers = members.filter((row) => dotRecordCategory(row) === "drivers");
  return {
    record: mergeDotProfileRecords(drivers.length > 0 ? drivers : [record]),
    related: members.filter((row) => dotRecordCategory(row) !== "drivers"),
  };
}

export function dotLocationText(row: Record<string, unknown>): string {
  return String(row.locationText ?? row.location ?? row.siteName ?? "").trim();
}

export function isDotRecordOpen(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return (
    !normalized.includes("closed") &&
    !normalized.includes("complet") &&
    !normalized.includes("archiv") &&
    !normalized.includes("resolv")
  );
}

export function dotStatusBadgeClass(status: string): string {
  const normalized = status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "ACTIVE" || normalized === "APPROVED") {
    return "bg-label-success";
  }
  if (normalized === "COMPLIANT") {
    return "bg-label-info";
  }
  if (normalized === "OPEN" || normalized === "PENDING" || normalized === "DRAFT") {
    return "bg-label-warning";
  }
  if (
    normalized === "EXPIRED" ||
    normalized === "OVERDUE" ||
    normalized === "NON_COMPLIANT" ||
    normalized === "NONCOMPLIANT"
  ) {
    return "bg-label-danger";
  }
  if (normalized === "ARCHIVED" || normalized === "CLOSED" || normalized === "COMPLETED") {
    return "bg-label-secondary";
  }
  return "bg-label-info";
}

/** Soft row background matching the status badge tone (Sneat `bg-label-*`). */
export function dotStatusRowClass(status: string): string {
  return dotStatusBadgeClass(status);
}

/** DRV-YYYY-NNNN when present on the DQF file. */
export function dotDriverReferenceId(row: Record<string, unknown>): string {
  for (const value of [
    row.sourceDocumentId,
    row.source_document_id,
    row.fileNumber,
    row.drvNumber,
    row.title,
    row.id,
  ]) {
    const match = String(value ?? "").match(/\bDRV-\d{4}-\d+\b/i);
    if (match?.[0]) return match[0].toUpperCase();
  }
  return "";
}

function formatDotListDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = text.slice(0, 10);
    const date = new Date(`${iso}T12:00:00`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
    return iso;
  }
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString();
}

/** e.g. "DQF Import · 8/11/2025 · Due 8/4/2026" */
export function dotDriverSourceMeta(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const hay = [row.seededFrom, row.sourceSystem, row.sourceCollection, row.sourcePath, row.title]
    .map((value) => String(value ?? ""))
    .join(" ");
  if (/dqf\s*import/i.test(hay) || row.dqf === true || isDotDqfDriverRecord(row)) {
    parts.push("DQF Import");
  }
  const created =
    formatDotListDate(row.recordDate) ||
    formatDotListDate(row.importedAt) ||
    formatDotListDate(row.createdAt);
  if (created) parts.push(created);
  const due = formatDotListDate(row.dueDate ?? row.due_date);
  if (due) parts.push(`Due ${due}`);
  return parts.join(" · ");
}

function isoDayDiff(earlier: string, later: string): number {
  const a = Date.parse(`${earlier.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${later.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** e.g. "Overdue 28d" when due date is in the past. */
export function dotDueOverdueLabel(
  row: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  const due = String(row.dueDate ?? row.due_date ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due >= today) return null;
  const days = isoDayDiff(due, today);
  return days > 0 ? `Overdue ${days}d` : "Overdue";
}

export type DotSummary = {
  total: number;
  open: number;
  complianceScore: number;
  byCategory: Record<DotCategory, number>;
};

export function summarizeDotRecords(rows: readonly Record<string, unknown>[]): DotSummary {
  const byCategory = emptyDotCategoryCounts();
  const drivers: Record<string, unknown>[] = [];
  const rest: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (isDotDqfDriverRecord(row)) drivers.push(row);
    else rest.push(row);
  }
  const driverProfiles = collapseDotDriverProfiles(drivers);
  byCategory.drivers = driverProfiles.length;
  for (const row of rest) byCategory[dotRecordCategory(row)] += 1;

  let open = driverProfiles.filter((row) => isDotRecordOpen(String(row.status ?? ""))).length;
  for (const row of rest) {
    if (isDotRecordOpen(String(row.status ?? ""))) open += 1;
  }
  const total = driverProfiles.length + rest.length;
  const complianceScore =
    total === 0 ? 100 : Math.round(((total - open) / Math.max(total, 1)) * 100);
  return { total, open, complianceScore, byCategory };
}

export type DotSort = "firstName" | "lastName";

export const DOT_SORT_OPTIONS: ReadonlyArray<{ value: DotSort; label: string }> = [
  { value: "firstName", label: "First name (A–Z)" },
  { value: "lastName", label: "Last name (A–Z)" },
];

export const DEFAULT_DOT_SORT: DotSort = "firstName";

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

function lastWord(value: string): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter((w) => w !== "");
  return words.length === 0 ? "" : words[words.length - 1]!;
}

function collate(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/** Name used for A–Z sorts: driver/worker first, then title (personnel-style). */
export function dotSortName(row: Record<string, unknown>): string {
  return dotWorkerName(row) || String(row.displayName ?? row.name ?? row.title ?? "").trim();
}

function dotNameParts(row: Record<string, unknown>): { first: string; last: string } {
  const first = String(row.firstName ?? "").trim();
  const last = String(row.lastName ?? "").trim();
  const name = dotSortName(row);
  return {
    first: first || firstWord(name),
    last: last || lastWord(name),
  };
}

/**
 * Alphabetizes DOT records the same way personnel does: first or last name,
 * then the other name, then the full display string.
 */
export function sortDotRecords(
  rows: readonly Record<string, unknown>[],
  sort: DotSort,
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const aParts = dotNameParts(a);
    const bParts = dotNameParts(b);
    const [aPrimary, aSecondary] =
      sort === "firstName" ? [aParts.first, aParts.last] : [aParts.last, aParts.first];
    const [bPrimary, bSecondary] =
      sort === "firstName" ? [bParts.first, bParts.last] : [bParts.last, bParts.first];
    return (
      collate(aPrimary, bPrimary) ||
      collate(aSecondary, bSecondary) ||
      collate(dotSortName(a), dotSortName(b)) ||
      collate(String(a.id ?? ""), String(b.id ?? ""))
    );
  });
}

export function parseDotSort(raw: string | null | undefined): DotSort {
  return raw === "lastName" ? "lastName" : DEFAULT_DOT_SORT;
}

export function filterDotRecords(
  rows: readonly Record<string, unknown>[],
  opts: {
    tab: DotTabId;
    q?: string;
    status?: string;
    sort?: DotSort;
  },
): Record<string, unknown>[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  const status = (opts.status ?? "").trim().toUpperCase();
  const source =
    opts.tab === "drivers" ? collapseDotDriverProfiles(filterDotDqfDriverRows(rows)) : rows;

  const filtered = source.filter((row) => {
    if (
      isDotCategoryTab(opts.tab) &&
      opts.tab !== "drivers" &&
      dotRecordCategory(row) !== opts.tab
    ) {
      return false;
    }
    if (status && String(row.status ?? "").toUpperCase() !== status) return false;
    if (!q) return true;
    const haystack = [
      row.title,
      row.displayName,
      row.workerName,
      row.driverName,
      row.employeeNumber,
      row.licenseNumber,
      row.locationText,
      row.category,
      row.sourceCollection,
    ]
      .map((value) => String(value ?? "").toLowerCase())
      .join(" ");
    return haystack.includes(q);
  });
  return sortDotRecords(filtered, opts.sort ?? DEFAULT_DOT_SORT);
}
