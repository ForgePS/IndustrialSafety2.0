export type SuppliesReportType =
  | "transactions"
  | "usage"
  | "inventory"
  | "ppe"
  | "expiring";

export type SuppliesReportField = {
  id: string;
  label: string;
  group: string;
  types: SuppliesReportType[];
};

export type SuppliesReportFilters = {
  reportType: SuppliesReportType;
  dateFrom: string;
  dateTo: string;
  itemId: string;
  categoryId: string;
  locationId: string;
  siteId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  departmentId: string;
  divisionName: string;
  transactionType: string;
  inventoryType: string;
  status: string;
  q: string;
  days: string;
};

export type SuppliesCustomReportTemplate = {
  id: string;
  name: string;
  fields: string[];
  filters: SuppliesReportFilters;
  createdAt: string;
  updatedAt: string;
};

export const SUPPLIES_REPORT_TYPES: Array<{ id: SuppliesReportType; label: string }> = [
  { id: "transactions", label: "Transaction ledger" },
  { id: "usage", label: "Usage summary" },
  { id: "inventory", label: "Inventory on hand" },
  { id: "ppe", label: "PPE assignments" },
  { id: "expiring", label: "Expiring lots" },
];

export const SUPPLIES_TRANSACTION_TYPES = [
  "RECEIVE",
  "ISSUE",
  "RETURN",
  "TRANSFER",
  "ADJUST",
  "PPE_ISSUE",
  "PPE_RETURN",
  "COUNT",
] as const;

export const SUPPLIES_REPORT_FIELDS: readonly SuppliesReportField[] = [
  { id: "createdAt", label: "Date / time", group: "Transaction", types: ["transactions"] },
  {
    id: "transactionType",
    label: "Transaction type",
    group: "Transaction",
    types: ["transactions"],
  },
  { id: "quantity", label: "Quantity", group: "Transaction", types: ["transactions", "ppe"] },
  {
    id: "previousQuantity",
    label: "Previous qty",
    group: "Transaction",
    types: ["transactions"],
  },
  { id: "newQuantity", label: "New qty", group: "Transaction", types: ["transactions"] },
  { id: "unitCost", label: "Unit cost", group: "Transaction", types: ["transactions"] },
  { id: "reason", label: "Reason / notes", group: "Transaction", types: ["transactions", "ppe"] },
  { id: "totalIssued", label: "Total issued", group: "Usage", types: ["usage"] },
  { id: "transactionCount", label: "Txn count", group: "Usage", types: ["usage"] },
  {
    id: "itemNumber",
    label: "Item #",
    group: "Item",
    types: ["transactions", "usage", "inventory", "ppe", "expiring"],
  },
  {
    id: "itemName",
    label: "Item name",
    group: "Item",
    types: ["transactions", "usage", "inventory", "ppe", "expiring"],
  },
  {
    id: "inventoryType",
    label: "Inventory type",
    group: "Item",
    types: ["transactions", "usage", "inventory"],
  },
  {
    id: "categoryName",
    label: "Category",
    group: "Item",
    types: ["transactions", "usage", "inventory", "ppe", "expiring"],
  },
  {
    id: "locationName",
    label: "Location",
    group: "Location",
    types: ["inventory", "expiring"],
  },
  {
    id: "locationCode",
    label: "Location code",
    group: "Location",
    types: ["inventory", "expiring"],
  },
  {
    id: "sourceLocationName",
    label: "Source location",
    group: "Location",
    types: ["transactions"],
  },
  {
    id: "destinationLocationName",
    label: "Destination location",
    group: "Location",
    types: ["transactions"],
  },
  {
    id: "quantityOnHand",
    label: "On hand",
    group: "Inventory",
    types: ["inventory"],
  },
  {
    id: "quantityAvailable",
    label: "Available",
    group: "Inventory",
    types: ["inventory"],
  },
  {
    id: "quantityReserved",
    label: "Reserved",
    group: "Inventory",
    types: ["inventory"],
  },
  { id: "reorderPoint", label: "Reorder point", group: "Inventory", types: ["inventory"] },
  {
    id: "averageUnitCost",
    label: "Avg unit cost",
    group: "Inventory",
    types: ["inventory"],
  },
  { id: "personnelName", label: "Personnel", group: "Org", types: ["transactions", "ppe"] },
  { id: "employeeNumber", label: "Employee #", group: "Org", types: ["transactions", "ppe"] },
  {
    id: "departmentName",
    label: "Department",
    group: "Org",
    types: ["transactions", "ppe"],
  },
  { id: "divisionName", label: "Division", group: "Org", types: ["transactions", "ppe"] },
  { id: "issueDate", label: "Issue date", group: "PPE", types: ["ppe"] },
  { id: "status", label: "Status", group: "PPE", types: ["ppe", "expiring"] },
  { id: "condition", label: "Condition", group: "PPE", types: ["ppe"] },
  { id: "sizeLabel", label: "Size", group: "PPE", types: ["ppe"] },
  {
    id: "replacementDueDate",
    label: "Replacement due",
    group: "PPE",
    types: ["ppe"],
  },
  { id: "lotNumber", label: "Lot #", group: "Lots", types: ["expiring"] },
  { id: "expirationDate", label: "Expiration", group: "Lots", types: ["expiring"] },
  { id: "dateReceived", label: "Date received", group: "Lots", types: ["expiring"] },
];

export const DEFAULT_SUPPLIES_REPORT_FILTERS: SuppliesReportFilters = {
  reportType: "transactions",
  dateFrom: "",
  dateTo: "",
  itemId: "",
  categoryId: "",
  locationId: "",
  siteId: "",
  sourceLocationId: "",
  destinationLocationId: "",
  departmentId: "",
  divisionName: "",
  transactionType: "",
  inventoryType: "",
  status: "",
  q: "",
  days: "90",
};

const PRESET_FIELDS: Record<SuppliesReportType, string[]> = {
  transactions: [
    "createdAt",
    "transactionType",
    "itemNumber",
    "itemName",
    "quantity",
    "sourceLocationName",
    "destinationLocationName",
    "personnelName",
    "departmentName",
    "divisionName",
    "reason",
  ],
  usage: ["itemNumber", "itemName", "categoryName", "totalIssued", "transactionCount"],
  inventory: [
    "itemNumber",
    "itemName",
    "categoryName",
    "locationName",
    "quantityOnHand",
    "quantityAvailable",
    "reorderPoint",
  ],
  ppe: [
    "issueDate",
    "personnelName",
    "employeeNumber",
    "departmentName",
    "divisionName",
    "itemName",
    "quantity",
    "status",
    "condition",
  ],
  expiring: [
    "expirationDate",
    "itemNumber",
    "itemName",
    "lotNumber",
    "quantity",
    "locationName",
    "status",
  ],
};

export const SUPPLIES_REPORT_PRESETS: Array<{
  id: string;
  name: string;
  fields: string[];
  filters?: Partial<SuppliesReportFilters>;
  relativeDays?: number;
}> = [
  {
    id: "txn-30",
    name: "Transactions — last 30 days",
    fields: PRESET_FIELDS.transactions,
    filters: { reportType: "transactions" },
    relativeDays: 30,
  },
  {
    id: "usage-30",
    name: "Usage — last 30 days",
    fields: PRESET_FIELDS.usage,
    filters: { reportType: "usage" },
    relativeDays: 30,
  },
  {
    id: "usage-90",
    name: "Usage — last 90 days",
    fields: PRESET_FIELDS.usage,
    filters: { reportType: "usage" },
    relativeDays: 90,
  },
  {
    id: "inventory",
    name: "Inventory on hand",
    fields: PRESET_FIELDS.inventory,
    filters: { reportType: "inventory" },
  },
  {
    id: "ppe-active",
    name: "Active PPE assignments",
    fields: PRESET_FIELDS.ppe,
    filters: { reportType: "ppe", status: "ASSIGNED" },
  },
  {
    id: "expiring-90",
    name: "Lots expiring in 90 days",
    fields: PRESET_FIELDS.expiring,
    filters: { reportType: "expiring", days: "90" },
  },
];

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function relativeDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fieldsForReportType(reportType: SuppliesReportType): SuppliesReportField[] {
  return SUPPLIES_REPORT_FIELDS.filter((f) => f.types.includes(reportType));
}

export function defaultFieldsForReportType(reportType: SuppliesReportType): string[] {
  return [...(PRESET_FIELDS[reportType] ?? PRESET_FIELDS.transactions)];
}

export function normalizeSuppliesReportFields(
  fields: string[],
  reportType: SuppliesReportType,
): string[] {
  const allowed = new Set(fieldsForReportType(reportType).map((f) => f.id));
  const unique = [...new Set(fields.filter((id) => allowed.has(id)))];
  return unique.length > 0 ? unique : defaultFieldsForReportType(reportType);
}

export function formatSuppliesReportCell(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return value;
  }
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildSuppliesReportCsv(
  rows: Array<Record<string, unknown>>,
  fieldIds: string[],
): string {
  const fields = fieldIds
    .map((id) => SUPPLIES_REPORT_FIELDS.find((f) => f.id === id))
    .filter(Boolean) as SuppliesReportField[];
  const header = fields.map((f) => csvEscape(f.label)).join(",");
  const lines = rows.map((row) =>
    fields.map((f) => csvEscape(formatSuppliesReportCell(row[f.id]))).join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadSuppliesReportCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugifySuppliesReportName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "supplies-report"
  );
}

const STORAGE_KEY = "forge.industrial.safety-supplies.custom-reports";

export function loadSuppliesCustomReports(tenantId: string): SuppliesCustomReportTemplate[] {
  if (!tenantId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${tenantId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SuppliesCustomReportTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSuppliesCustomReports(
  tenantId: string,
  templates: SuppliesCustomReportTemplate[],
) {
  if (!tenantId || typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY}.${tenantId}`, JSON.stringify(templates));
}

export function buildSuppliesReportQuery(
  filters: SuppliesReportFilters,
): Record<string, string> {
  const query: Record<string, string> = {
    reportType: filters.reportType,
    page: "1",
    pageSize: "2000",
  };
  if (filters.dateFrom) query.dateFrom = filters.dateFrom;
  if (filters.dateTo) query.dateTo = filters.dateTo;
  if (filters.itemId) query.itemId = filters.itemId;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.locationId) query.locationId = filters.locationId;
  if (filters.siteId) query.siteId = filters.siteId;
  if (filters.sourceLocationId) query.sourceLocationId = filters.sourceLocationId;
  if (filters.destinationLocationId) {
    query.destinationLocationId = filters.destinationLocationId;
  }
  if (filters.departmentId) query.departmentId = filters.departmentId;
  if (filters.divisionName) query.divisionName = filters.divisionName;
  if (filters.transactionType) query.transactionType = filters.transactionType;
  if (filters.inventoryType) query.inventoryType = filters.inventoryType;
  if (filters.status) query.status = filters.status;
  if (filters.q.trim()) query.q = filters.q.trim();
  if (filters.reportType === "expiring" && filters.days) query.days = filters.days;
  return query;
}
