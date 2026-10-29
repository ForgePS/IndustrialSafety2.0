"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { ForgePrintDialog } from "@/components/forge-print-dialog";
import { SafetySuppliesReportBuilder } from "@/components/safety-supplies-report-builder";
import { SafetySupplyQrStationsPanel } from "@/components/safety-supply-qr-stations-panel";
import { SafetySupplyRequestsPanel } from "@/components/safety-supply-requests-panel";
import { SignaturePad } from "@/components/signature-pad";
import { canDeleteSupplyItems, canManageSupplyLocations } from "@/lib/form-signatory";
import { isAcceptableSignature } from "@/lib/personnel-form";
import {
  divisionsForLocationCascade,
  filterDepartmentsForSiteDivision,
  type DivisionOption,
} from "@/lib/personnel-assignment";
import { loadOrgFilterCatalogs, type LookupOption } from "@/lib/personnel-lookups";
import {
  canGenerateQr,
  canPrintQr,
  canViewQrLinks,
  type QrLinkListResponse,
  type QrLinkRow,
} from "@/lib/qr-links-module";
import { composeQrLinkStickerBlob, printQrLinkSticker } from "@/lib/qr-link-sticker";
import {
  printSupplyIssueAcknowledgment,
  type SupplyIssuePrintLine,
} from "@/lib/safety-supplies-issue-print";

type TabId =
  | "dashboard"
  | "inventory"
  | "items"
  | "locations"
  | "receive"
  | "issue"
  | "ppe"
  | "transfers"
  | "requests"
  | "qr-stations"
  | "vendors"
  | "purchase-orders"
  | "reorder"
  | "expiring"
  | "kits"
  | "transactions"
  | "reports"
  | "categories"
  | "settings";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "items", label: "Items" },
  { id: "locations", label: "Locations" },
  { id: "receive", label: "Receive" },
  { id: "issue", label: "Issue" },
  { id: "ppe", label: "PPE" },
  { id: "transfers", label: "Transfers" },
  { id: "requests", label: "Requests" },
  { id: "qr-stations", label: "QR Supply Requests" },
  { id: "vendors", label: "Vendors" },
  { id: "purchase-orders", label: "Purchase Orders" },
  { id: "reorder", label: "Reorder" },
  { id: "expiring", label: "Expiring" },
  { id: "kits", label: "Kits" },
  { id: "transactions", label: "Transactions" },
  { id: "reports", label: "Reports" },
  { id: "categories", label: "Categories" },
  { id: "settings", label: "Settings" },
];

const INVENTORY_TYPES = [
  "CONSUMABLE",
  "REUSABLE",
  "SERIALIZED",
  "LOT_CONTROLLED",
  "EMPLOYEE_ASSIGNED",
] as const;

const LOCATION_TYPES = [
  "SUPPLY_ROOM",
  "WAREHOUSE",
  "CABINET",
  "VEHICLE",
  "JOB_SITE",
  "OTHER",
] as const;

const PPE_RETURN_CONDITIONS = ["GOOD", "FAIR", "DAMAGED", "UNSAFE", "LOST"] as const;

type ListResponse<T> = { items: T[]; page?: number; pageSize?: number; total?: number };

type SuppliesDashboard = {
  totalInventoryValue: number;
  totalInventoryItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  expiringSoon: number;
  expiredItems: number;
  pendingRequests: number;
  openPurchaseOrders: number;
  suppliesReceivedThisMonth: number;
  suppliesIssuedThisMonth: number;
  inventoryAdjustments: number;
  damagedEquipment: number;
  equipmentAwaitingInspection: number;
  employeePpeAssignments: number;
  categoryCount: number;
  moduleStatus: string;
};

type SupplyCategory = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isSystem: boolean;
  status: string;
};

type SupplySettings = {
  id: string | null;
  allowNegativeInventory: boolean;
  requireAdjustmentApproval: boolean;
  requireBlindInventoryCount: boolean;
  enableInventoryCosting: boolean;
  defaultLowStockThreshold: number;
  requireEmployeeAcknowledgment: boolean;
  requireReturnCondition: boolean;
  allowPpeIssueOverride: boolean;
  requireTrainingVerification: boolean;
  enablePurchaseRequests: boolean;
  enablePurchaseOrders: boolean;
  requirePoApproval: boolean;
  purchaseApprovalThreshold: string | null;
  defaultLabelType: string;
  defaultPrinter: string | null;
  autoCreateQrOnItemCreate: boolean;
  settings?: {
    locationTypes?: string[];
    defaultLocationType?: string;
    defaultSourceLocationId?: string | null;
    defaultDestinationLocationId?: string | null;
    monthlyDepartmentUsageEmailToSafetyDirectors?: boolean;
    monthlyDepartmentUsageScheduleId?: string;
    monthlyDepartmentUsageDefinitionId?: string;
    notifications?: {
      requestSubmittedInApp?: boolean;
      requestUrgentInApp?: boolean;
      requestAssignedInApp?: boolean;
      requestApprovedInApp?: boolean;
      requestDeniedInApp?: boolean;
      requestReadyInApp?: boolean;
      requestFulfilledInApp?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
    };
    [key: string]: unknown;
  };
};

type SupplyItem = {
  id: string;
  itemNumber: string;
  name: string;
  inventoryType: string;
  unitOfMeasure: string;
  categoryId?: string | null;
  reorderPoint?: string | number | null;
  minimumQuantity?: string | number | null;
  status?: string;
};

type SupplyLocation = {
  id: string;
  code: string;
  name: string;
  locationType: string;
  status?: string;
  siteId?: string | null;
};

type InventoryRow = {
  id: string;
  itemId: string;
  locationId: string;
  itemName: string;
  itemNumber?: string;
  locationName: string;
  locationCode?: string;
  quantityOnHand: string | number;
  quantityAvailable: string | number;
  quantityReserved: string | number;
  reorderPoint?: string | number | null;
};

type PpeAssignment = {
  id: string;
  personnelId: string;
  itemId: string;
  itemName?: string;
  itemNumber?: string;
  quantity: string | number;
  issueDate?: string | null;
  status: string;
  condition?: string | null;
};

type SupplyRequest = {
  id: string;
  requestNumber: string;
  status: string;
  priority?: string | null;
  source?: string | null;
  requestorType?: string | null;
  contractorName?: string | null;
  locationId?: string | null;
  siteId?: string | null;
  reason?: string | null;
  notes?: string | null;
  neededBy?: string | null;
  createdAt?: string;
};

type RequestAnalytics = {
  openRequests: number;
  urgentRequests: number;
  readyForPickup: number;
  fulfilledToday: number;
  totalScans?: number;
  totalQrRequests?: number;
  conversionRate?: number | null;
  topQrStations: Array<{ id: string; name: string; scanCount: number; requestCount?: number }>;
};

type SupplyVendor = {
  id: string;
  vendorNumber: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status?: string;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName?: string;
  status: string;
  total?: string | number | null;
  orderDate?: string | null;
  shipToLocationId?: string | null;
};

type ReorderRow = {
  itemId: string;
  itemNumber: string;
  itemName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantityAvailable: number;
  reorderPoint: number;
  suggestedOrderQuantity: number;
};

type ExpiringLot = {
  id: string;
  itemId: string;
  itemName?: string;
  itemNumber?: string;
  lotNumber: string;
  quantity: string | number;
  expirationDate?: string | null;
  locationId?: string | null;
  status?: string;
};

type SupplyKit = {
  id: string;
  kitNumber: string;
  name: string;
  kitType: string;
  status: string;
  locationId?: string | null;
};

type SupplyTransaction = {
  id: string;
  itemId: string;
  itemName?: string;
  itemNumber?: string;
  transactionType: string;
  quantity: string | number;
  previousQuantity?: string | number | null;
  newQuantity?: string | number | null;
  sourceLocationId?: string | null;
  createdAt?: string;
  reason?: string | null;
};

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="col-6 col-md-4 col-xl-3">
      <div className="card h-100">
        <div className="card-body">
          <p className="text-muted small mb-1">{label}</p>
          <h4 className="mb-0">{value}</h4>
        </div>
      </div>
    </div>
  );
}

function qty(value: string | number | null | undefined) {
  if (value == null || value === "") return "0";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) return n % 1 === 0 ? String(n) : n.toFixed(2);
  return String(value);
}

const LIST_QUERY = { page: "1", pageSize: "200" };

function normalizeLocationTypeLabel(value: string): string {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}

function locationTypesFromSettings(settings: SupplySettings | null | undefined): string[] {
  const custom = settings?.settings?.locationTypes;
  if (Array.isArray(custom) && custom.length > 0) {
    const cleaned = custom
      .map((value) => normalizeLocationTypeLabel(String(value ?? "")))
      .filter(Boolean);
    if (cleaned.length > 0) return [...new Set(cleaned)];
  }
  return [...LOCATION_TYPES];
}

function defaultLocationTypeFromSettings(settings: SupplySettings | null | undefined): string {
  const types = locationTypesFromSettings(settings);
  const preferred = String(settings?.settings?.defaultLocationType ?? "").trim();
  if (preferred && types.includes(normalizeLocationTypeLabel(preferred))) {
    return normalizeLocationTypeLabel(preferred);
  }
  return types[0] ?? "SUPPLY_ROOM";
}

export function SafetySuppliesWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me?.permissions]);
  const canDeleteItems = canDeleteSupplyItems({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    permissions: me?.permissions,
  });
  const canManageLocations = canManageSupplyLocations({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    permissions: me?.permissions,
  });
  const suppliesManage =
    permissions.has("industrial.supplies.manage") ||
    permissions.has("industrial.supplies.create") ||
    permissions.has("industrial.admin");
  const canQrView = canViewQrLinks(permissions) || suppliesManage;
  const canQrGenerate = canGenerateQr(permissions) || suppliesManage;
  const canQrPrint = canPrintQr(permissions) || suppliesManage;
  const canPrinterPrint =
    permissions.has("industrial.printer.print") || permissions.has("industrial.admin");
  const showItemActions = canDeleteItems || canQrPrint || canPrinterPrint;
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>("dashboard");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "SAFETY_SUPPLIES",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "dashboard",
      ),
    );
  }, [tab, visibleTabs]);
  const [deepLinkRequestId, setDeepLinkRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [qrPrintingId, setQrPrintingId] = useState<string | null>(null);
  const [bridgePrintItem, setBridgePrintItem] = useState<SupplyItem | null>(null);

  const [dashboard, setDashboard] = useState<SuppliesDashboard | null>(null);
  const [requestAnalytics, setRequestAnalytics] = useState<RequestAnalytics | null>(null);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [locations, setLocations] = useState<SupplyLocation[]>([]);
  const [categories, setCategories] = useState<SupplyCategory[]>([]);
  const [settings, setSettings] = useState<SupplySettings | null>(null);
  const [facilitySites, setFacilitySites] = useState<LookupOption[]>([]);
  const [orgDepartments, setOrgDepartments] = useState<LookupOption[]>([]);
  const [orgDivisionEntries, setOrgDivisionEntries] = useState<DivisionOption[]>([]);
  const [orgSiteId, setOrgSiteId] = useState("");
  const [orgDivisionName, setOrgDivisionName] = useState("");
  const [orgDepartmentId, setOrgDepartmentId] = useState("");

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [ppe, setPpe] = useState<PpeAssignment[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [vendors, setVendors] = useState<SupplyVendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [reorder, setReorder] = useState<ReorderRow[]>([]);
  const [expiring, setExpiring] = useState<ExpiringLot[]>([]);
  const [kits, setKits] = useState<SupplyKit[]>([]);
  const [transactions, setTransactions] = useState<SupplyTransaction[]>([]);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newLocationType, setNewLocationType] = useState("");
  const [itemForm, setItemForm] = useState({
    name: "",
    itemNumber: "",
    inventoryType: "CONSUMABLE",
    categoryId: "",
    unitOfMeasure: "EA",
    reorderPoint: "0",
    minimumQuantity: "0",
  });
  const [locationForm, setLocationForm] = useState({
    code: "",
    name: "",
    locationType: "SUPPLY_ROOM",
    siteId: "",
  });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [receiveForm, setReceiveForm] = useState({
    itemId: "",
    locationId: "",
    quantity: "1",
    lotNumber: "",
    expirationDate: "",
    unitCost: "",
  });
  const [issueForm, setIssueForm] = useState({
    itemId: "",
    locationId: "",
    quantity: "1",
    personnelId: "",
    departmentId: "",
    recipientName: "",
    recipientSignatureDataUrl: "",
    printAcknowledgment: true,
  });
  const [issueLines, setIssueLines] = useState<
    Array<
      SupplyIssuePrintLine & {
        itemId: string;
        locationId: string;
      }
    >
  >([]);
  const [ppeForm, setPpeForm] = useState({
    personnelId: "",
    itemId: "",
    locationId: "",
    quantity: "1",
    departmentId: "",
    recipientName: "",
    recipientSignatureDataUrl: "",
    printAcknowledgment: true,
  });
  const [ppeReturnCondition, setPpeReturnCondition] = useState<string>("GOOD");
  const [transferForm, setTransferForm] = useState({
    sourceLocationId: "",
    destinationLocationId: "",
    itemId: "",
    quantity: "1",
    departmentId: "",
  });
  const [requestForm, setRequestForm] = useState({
    itemId: "",
    quantity: "1",
    locationId: "",
    reason: "",
    departmentId: "",
  });
  const [approveLocationId, setApproveLocationId] = useState("");
  const [vendorForm, setVendorForm] = useState({ name: "", phone: "", email: "" });
  const [poForm, setPoForm] = useState({
    vendorId: "",
    shipToLocationId: "",
    itemId: "",
    quantity: "1",
    unitPrice: "0",
  });
  const [kitForm, setKitForm] = useState({
    name: "",
    kitType: "FIRST_AID",
    locationId: "",
    itemId: "",
    expectedQuantity: "1",
  });

  const loadCore = useCallback(async () => {
    const [dash, itemRes, locRes, catRes, settingsRes, orgCatalogs, analyticsRes] =
      await Promise.all([
        apiGet<SuppliesDashboard>("/api/v1/industrial/supplies/dashboard"),
        apiGet<ListResponse<SupplyItem>>("/api/v1/industrial/supplies/items", {
          query: LIST_QUERY,
        }),
        apiGet<ListResponse<SupplyLocation>>("/api/v1/industrial/supplies/locations", {
          query: LIST_QUERY,
        }),
        apiGet<ListResponse<SupplyCategory>>("/api/v1/industrial/supplies/categories"),
        apiGet<SupplySettings>("/api/v1/industrial/supplies/settings").catch(() => null),
        loadOrgFilterCatalogs(tenantId || undefined).catch(() => null),
        apiGet<RequestAnalytics>("/api/v1/industrial/supplies/request-analytics").catch(() => null),
      ]);
    setDashboard(dash);
    setRequestAnalytics(analyticsRes);
    setItems(itemRes.items ?? []);
    setLocations(locRes.items ?? []);
    setCategories(catRes.items ?? []);
    if (orgCatalogs) {
      setFacilitySites(orgCatalogs.sites);
      setOrgDepartments(orgCatalogs.departments);
      setOrgDivisionEntries(orgCatalogs.divisionEntries);
    }
    if (settingsRes) {
      setSettings(settingsRes);
      setLocationForm((prev) => ({
        ...prev,
        locationType: defaultLocationTypeFromSettings(settingsRes),
      }));
      setTransferForm((prev) => ({
        ...prev,
        sourceLocationId:
          prev.sourceLocationId ||
          String(settingsRes.settings?.defaultSourceLocationId ?? "").trim() ||
          "",
        destinationLocationId:
          prev.destinationLocationId ||
          String(settingsRes.settings?.defaultDestinationLocationId ?? "").trim() ||
          "",
      }));
    }
  }, [tenantId]);

  const loadTabData = useCallback(async (active: TabId) => {
    if (active === "inventory") {
      const res = await apiGet<ListResponse<InventoryRow>>(
        "/api/v1/industrial/supplies/inventory",
        { query: LIST_QUERY },
      );
      setInventory(res.items ?? []);
    } else if (active === "ppe") {
      const res = await apiGet<ListResponse<PpeAssignment>>("/api/v1/industrial/supplies/ppe", {
        query: LIST_QUERY,
      });
      setPpe(res.items ?? []);
    } else if (active === "requests") {
      const [res, invRes] = await Promise.all([
        apiGet<ListResponse<SupplyRequest>>("/api/v1/industrial/supplies/requests", {
          query: LIST_QUERY,
        }),
        apiGet<ListResponse<InventoryRow>>("/api/v1/industrial/supplies/inventory", {
          query: LIST_QUERY,
        }),
      ]);
      setRequests(res.items ?? []);
      setInventory(invRes.items ?? []);
    } else if (active === "qr-stations") {
      /* stations panel loads itself */
    } else if (active === "vendors") {
      const res = await apiGet<ListResponse<SupplyVendor>>("/api/v1/industrial/supplies/vendors", {
        query: LIST_QUERY,
      });
      setVendors(res.items ?? []);
    } else if (active === "purchase-orders") {
      const [poRes, vendorRes] = await Promise.all([
        apiGet<ListResponse<PurchaseOrder>>("/api/v1/industrial/supplies/purchase-orders", {
          query: LIST_QUERY,
        }),
        apiGet<ListResponse<SupplyVendor>>("/api/v1/industrial/supplies/vendors", {
          query: LIST_QUERY,
        }),
      ]);
      setPurchaseOrders(poRes.items ?? []);
      setVendors(vendorRes.items ?? []);
    } else if (active === "reorder") {
      const res = await apiGet<{ items: ReorderRow[] }>("/api/v1/industrial/supplies/reorder");
      setReorder(res.items ?? []);
    } else if (active === "expiring") {
      const res = await apiGet<ListResponse<ExpiringLot>>("/api/v1/industrial/supplies/expiring", {
        query: { ...LIST_QUERY, days: "90" },
      });
      setExpiring(res.items ?? []);
    } else if (active === "kits") {
      const res = await apiGet<ListResponse<SupplyKit>>("/api/v1/industrial/supplies/kits", {
        query: LIST_QUERY,
      });
      setKits(res.items ?? []);
    } else if (active === "transactions") {
      const res = await apiGet<ListResponse<SupplyTransaction>>(
        "/api/v1/industrial/supplies/transactions",
        { query: LIST_QUERY },
      );
      setTransactions(res.items ?? []);
    } else if (active === "settings") {
      const next = await apiGet<SupplySettings>("/api/v1/industrial/supplies/settings");
      setSettings(next);
      setLocationForm((prev) => ({
        ...prev,
        locationType: defaultLocationTypeFromSettings(next),
      }));
      setTransferForm((prev) => ({
        ...prev,
        sourceLocationId:
          prev.sourceLocationId ||
          String(next.settings?.defaultSourceLocationId ?? "").trim() ||
          "",
        destinationLocationId:
          prev.destinationLocationId ||
          String(next.settings?.defaultDestinationLocationId ?? "").trim() ||
          "",
      }));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadCore();
      await loadTabData(tab);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load Safety Supplies");
    } finally {
      setLoading(false);
    }
  }, [loadCore, loadTabData, tab]);

  useEffect(() => {
    setSuccess("");
    void load();
  }, [load]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const idParam = searchParams.get("id");
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setTab(tabParam as TabId);
    }
    if (idParam) {
      setDeepLinkRequestId(idParam);
      setTab("requests");
    }
  }, [searchParams]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((row) => {
      const hay =
        `${row.itemName} ${row.itemNumber ?? ""} ${row.locationName} ${row.locationCode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [inventory, inventorySearch]);

  const divisionOptions = useMemo(
    () => divisionsForLocationCascade(orgDivisionEntries, orgDepartments, orgSiteId || undefined),
    [orgDivisionEntries, orgDepartments, orgSiteId],
  );

  const departmentOptions = useMemo(
    () =>
      filterDepartmentsForSiteDivision(
        orgDepartments,
        orgSiteId || undefined,
        orgDivisionName || undefined,
      ),
    [orgDepartments, orgSiteId, orgDivisionName],
  );

  const locationsForOrgSite = useMemo(() => {
    const base = locations.filter(
      (loc) => !/^prm/i.test(loc.name.trim()) && !/^prm/i.test(loc.code.trim()),
    );
    if (!orgSiteId) return base;
    return base.filter((loc) => !loc.siteId || loc.siteId === orgSiteId);
  }, [locations, orgSiteId]);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of facilitySites) map.set(site.id, site.label);
    return map;
  }, [facilitySites]);

  const facilitySitesForLocations = useMemo(
    () => facilitySites.filter((site) => !/^prm/i.test(site.label.trim())),
    [facilitySites],
  );

  const visibleLocations = useMemo(
    () =>
      locations.filter((loc) => !/^prm/i.test(loc.name.trim()) && !/^prm/i.test(loc.code.trim())),
    [locations],
  );

  const tenantDisplayName = useMemo(() => {
    const tenants = me?.tenants ?? [];
    const active =
      tenants.find((t) => t.tenantId === me?.tenantId && t.selectable) ??
      tenants.find((t) => t.tenantId === me?.tenantId);
    return active?.displayName?.trim() || "Forge Industrial Safety";
  }, [me]);

  const issuedByLabel = useMemo(() => me?.userId ?? "", [me?.userId]);

  function setOrgCascade(patch: { siteId?: string; divisionName?: string; departmentId?: string }) {
    const nextSite = patch.siteId !== undefined ? patch.siteId : orgSiteId;
    const nextDivision = patch.divisionName !== undefined ? patch.divisionName : orgDivisionName;
    let nextDept = patch.departmentId !== undefined ? patch.departmentId : orgDepartmentId;
    if (patch.siteId !== undefined || patch.divisionName !== undefined) {
      const stillValid = filterDepartmentsForSiteDivision(
        orgDepartments,
        nextSite || undefined,
        nextDivision || undefined,
      ).some((d) => d.id === nextDept);
      if (!stillValid) nextDept = "";
    }
    setOrgSiteId(nextSite);
    setOrgDivisionName(nextDivision);
    setOrgDepartmentId(nextDept);
    setIssueForm((prev) => ({ ...prev, departmentId: nextDept }));
    setPpeForm((prev) => ({ ...prev, departmentId: nextDept }));
    setRequestForm((prev) => ({ ...prev, departmentId: nextDept }));
  }

  async function runAction(action: () => Promise<void>, okMessage: string): Promise<boolean> {
    setSaving(true);
    setSuccess("");
    try {
      await action();
      setSuccess(okMessage);
      setError("");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createItem(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/items", "POST", {
        name: itemForm.name.trim(),
        itemNumber: itemForm.itemNumber.trim() || undefined,
        inventoryType: itemForm.inventoryType,
        categoryId: itemForm.categoryId || undefined,
        unitOfMeasure: itemForm.unitOfMeasure.trim() || "EA",
        reorderPoint: itemForm.reorderPoint || "0",
        minimumQuantity: itemForm.minimumQuantity || "0",
      });
      setItemForm({
        name: "",
        itemNumber: "",
        inventoryType: "CONSUMABLE",
        categoryId: "",
        unitOfMeasure: "EA",
        reorderPoint: "0",
        minimumQuantity: "0",
      });
    }, "Item created");
  }

  async function deleteItem(item: SupplyItem) {
    if (!canDeleteItems) return;
    const label = item.itemNumber ? `${item.name} (${item.itemNumber})` : item.name;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete item "${label}"? It will be archived and removed from active lists.`)
    ) {
      return;
    }
    await runAction(async () => {
      await apiSend(
        `/api/v1/industrial/supplies/items/${encodeURIComponent(item.id)}/archive`,
        "POST",
        {},
      );
    }, "Item deleted");
  }

  async function ensureItemQrLink(item: SupplyItem): Promise<QrLinkRow> {
    const label = item.name.trim() || item.itemNumber || "Safety supply";
    let link: QrLinkRow | undefined;
    if (canQrView) {
      const listed = await apiGet<QrLinkListResponse>("/api/v1/qr-links", {
        query: { targetType: "SAFETY_SUPPLY", page: "1", pageSize: "200" },
      });
      link = (listed.items ?? []).find(
        (row) => row.targetId === item.id && row.targetType === "SAFETY_SUPPLY",
      );
      if (!link) {
        const listedAlt = await apiGet<QrLinkListResponse>("/api/v1/qr-links", {
          query: { targetType: "SUPPLY_ITEM", page: "1", pageSize: "200" },
        });
        link = (listedAlt.items ?? []).find(
          (row) => row.targetId === item.id && row.targetType === "SUPPLY_ITEM",
        );
      }
    }

    if (!link) {
      if (!canQrGenerate) {
        throw new Error("No QR code for this item, and you cannot create one.");
      }
      link = await apiSend<QrLinkRow>("/api/v1/qr-links", "POST", {
        name: `${label} supply QR`,
        targetType: "SAFETY_SUPPLY",
        targetId: item.id,
        accessMode: "EMPLOYEE_NUMBER",
        issueToken: true,
        isPublic: true,
        appBaseUrl: window.location.origin,
        actionConfig: {
          viewSupplies: true,
          supplyItemId: item.id,
        },
      });
    } else if (!link.publicToken && !link.token && canQrGenerate) {
      link = await apiSend<QrLinkRow>(
        `/api/v1/qr-links/${encodeURIComponent(link.id)}/issue-token`,
        "POST",
        { appBaseUrl: window.location.origin },
      );
    }

    return link;
  }

  async function printItemQr(item: SupplyItem) {
    if (!canQrPrint) return;
    setQrPrintingId(item.id);
    setSuccess("");
    try {
      const link = await ensureItemQrLink(item);
      const token = String(link.publicToken ?? link.token ?? "").trim();
      if (!token) {
        throw new Error("QR link exists but has no public token yet.");
      }
      const image = await apiSend<{ dataBase64: string }>(
        `/api/v1/qr-links/${encodeURIComponent(link.id)}/qr-image`,
        "POST",
        { token, appBaseUrl: window.location.origin },
      );
      const label = item.name.trim() || "Safety supply";
      const subtitle = [item.itemNumber, link.displayCode].filter(Boolean).join(" · ");
      const stickerBlob = await composeQrLinkStickerBlob(
        image.dataBase64,
        label,
        subtitle || undefined,
        item.inventoryType ? `Type: ${item.inventoryType}` : undefined,
      );
      const stickerUrl = URL.createObjectURL(stickerBlob);
      try {
        const blocked = await printQrLinkSticker(stickerUrl, `${label} QR`, stickerBlob);
        if (blocked) {
          setError("Pop-up blocked. Allow pop-ups to print the QR sticker.");
        } else {
          setSuccess(`Print dialog opened for ${label}.`);
          setError("");
        }
      } finally {
        URL.revokeObjectURL(stickerUrl);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "QR print failed",
      );
    } finally {
      setQrPrintingId(null);
    }
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    if (editingLocationId && !canManageLocations) return;
    await runAction(
      async () => {
        const payload = {
          code: locationForm.code.trim(),
          name: locationForm.name.trim(),
          locationType: locationForm.locationType,
          siteId: locationForm.siteId || null,
        };
        if (editingLocationId) {
          await apiSend(
            `/api/v1/industrial/supplies/locations/${encodeURIComponent(editingLocationId)}`,
            "PATCH",
            payload,
          );
        } else {
          await apiSend("/api/v1/industrial/supplies/locations", "POST", {
            ...payload,
            siteId: locationForm.siteId || undefined,
          });
        }
        setLocationForm({
          code: "",
          name: "",
          locationType: defaultLocationTypeFromSettings(settings),
          siteId: "",
        });
        setEditingLocationId(null);
      },
      editingLocationId ? "Location updated" : "Location created",
    );
  }

  function beginEditLocation(loc: SupplyLocation) {
    if (!canManageLocations) return;
    setEditingLocationId(loc.id);
    setLocationForm({
      code: loc.code,
      name: loc.name,
      locationType: loc.locationType || defaultLocationTypeFromSettings(settings),
      siteId: loc.siteId ?? "",
    });
  }

  function cancelEditLocation() {
    setEditingLocationId(null);
    setLocationForm({
      code: "",
      name: "",
      locationType: defaultLocationTypeFromSettings(settings),
      siteId: "",
    });
  }

  async function deleteLocation(loc: SupplyLocation) {
    if (!canManageLocations) return;
    if (
      !window.confirm(
        `Delete location "${loc.name}" (${loc.code})? It will be archived and removed from active lists.`,
      )
    ) {
      return;
    }
    await runAction(async () => {
      await apiSend(
        `/api/v1/industrial/supplies/locations/${encodeURIComponent(loc.id)}/archive`,
        "POST",
        {},
      );
      if (editingLocationId === loc.id) cancelEditLocation();
    }, "Location deleted");
  }

  async function submitReceive(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/receive", "POST", {
        itemId: receiveForm.itemId,
        locationId: receiveForm.locationId,
        quantity: Number(receiveForm.quantity),
        lotNumber: receiveForm.lotNumber.trim() || undefined,
        expirationDate: receiveForm.expirationDate || undefined,
        unitCost: receiveForm.unitCost.trim() || undefined,
      });
      setReceiveForm({
        itemId: "",
        locationId: "",
        quantity: "1",
        lotNumber: "",
        expirationDate: "",
        unitCost: "",
      });
    }, "Supplies received");
  }

  async function submitIssue(e: FormEvent) {
    e.preventDefault();
    const linesToIssue =
      issueLines.length > 0
        ? issueLines
        : (() => {
            const item = items.find((row) => row.id === issueForm.itemId);
            const loc = locations.find((row) => row.id === issueForm.locationId);
            if (!item || !issueForm.locationId) return [];
            return [
              {
                itemId: item.id,
                itemName: item.name,
                itemNumber: item.itemNumber,
                quantity: issueForm.quantity,
                unitOfMeasure: item.unitOfMeasure,
                locationId: issueForm.locationId,
                locationName: loc ? `${loc.name} (${loc.code})` : issueForm.locationId,
              },
            ];
          })();
    if (linesToIssue.length === 0) {
      setError("Add at least one item to issue.");
      return;
    }

    const shouldPrint = issueForm.printAcknowledgment;
    const recipientName = issueForm.recipientName.trim();
    const recipientSignatureDataUrl = issueForm.recipientSignatureDataUrl.trim();
    const recipientId = issueForm.personnelId.trim();
    const departmentId = issueForm.departmentId || orgDepartmentId;
    const departmentName = orgDepartments.find((d) => d.id === departmentId)?.label ?? "";

    if (!recipientName) {
      setError("Enter the recipient’s printed name.");
      return;
    }
    if (!recipientSignatureDataUrl || !isAcceptableSignature(recipientSignatureDataUrl)) {
      setError("Have the recipient sign in the signature box before issuing.");
      return;
    }

    const signedAt = new Date();
    const ok = await runAction(async () => {
      for (const line of linesToIssue) {
        await apiSend("/api/v1/industrial/supplies/issue", "POST", {
          itemId: line.itemId,
          locationId: line.locationId,
          quantity: Number(line.quantity),
          personnelId: recipientId || undefined,
          departmentId: departmentId || undefined,
          recipientPrintedName: recipientName,
          recipientSignatureDataUrl,
        });
      }

      setIssueForm((prev) => ({
        ...prev,
        itemId: "",
        locationId: "",
        quantity: "1",
        personnelId: "",
        departmentId: "",
        recipientName: "",
        recipientSignatureDataUrl: "",
      }));
      setIssueLines([]);
    }, "Supplies issued");

    if (ok && shouldPrint) {
      const blocked = printSupplyIssueAcknowledgment({
        title: "Safety Supplies Issue Acknowledgment",
        tenantName: tenantDisplayName,
        recipientName: recipientName || undefined,
        recipientId: recipientId || undefined,
        recipientSignatureDataUrl,
        recipientSignedAt: signedAt,
        facilityName: orgSiteId ? siteNameById.get(orgSiteId) : undefined,
        divisionName: orgDivisionName || undefined,
        departmentName: departmentName || undefined,
        issuedBy: issuedByLabel || undefined,
        lines: linesToIssue,
      });
      if (blocked) {
        setError(blocked);
      } else {
        setSuccess("Supplies issued — acknowledgment opened for printing.");
      }
    }
  }

  function addIssueLine() {
    const item = items.find((row) => row.id === issueForm.itemId);
    const loc = locations.find((row) => row.id === issueForm.locationId);
    if (!item) {
      setError("Select an item to add.");
      return;
    }
    if (!issueForm.locationId) {
      setError("Select a storage location.");
      return;
    }
    const qty = Number(issueForm.quantity);
    if (!(qty > 0)) {
      setError("Quantity must be greater than zero.");
      return;
    }
    setIssueLines((prev) => [
      ...prev,
      {
        itemId: item.id,
        itemName: item.name,
        itemNumber: item.itemNumber,
        quantity: issueForm.quantity,
        unitOfMeasure: item.unitOfMeasure,
        locationId: issueForm.locationId,
        locationName: loc ? `${loc.name} (${loc.code})` : issueForm.locationId,
      },
    ]);
    setIssueForm((prev) => ({ ...prev, itemId: "", quantity: "1" }));
    setError("");
  }

  async function submitPpeIssue(e: FormEvent) {
    e.preventDefault();
    const item = items.find((row) => row.id === ppeForm.itemId);
    const loc = locations.find((row) => row.id === ppeForm.locationId);
    const shouldPrint = ppeForm.printAcknowledgment;
    const recipientName = ppeForm.recipientName.trim();
    const recipientSignatureDataUrl = ppeForm.recipientSignatureDataUrl.trim();
    const recipientId = ppeForm.personnelId.trim();
    const departmentId = ppeForm.departmentId || orgDepartmentId;
    const departmentName = orgDepartments.find((d) => d.id === departmentId)?.label ?? "";
    const printLines = [
      {
        itemName: item?.name ?? ppeForm.itemId,
        itemNumber: item?.itemNumber,
        quantity: ppeForm.quantity,
        unitOfMeasure: item?.unitOfMeasure,
        locationName: loc ? `${loc.name} (${loc.code})` : ppeForm.locationId,
      },
    ];

    if (!recipientName) {
      setError("Enter the recipient’s printed name.");
      return;
    }
    if (!recipientSignatureDataUrl || !isAcceptableSignature(recipientSignatureDataUrl)) {
      setError("Have the recipient sign in the signature box before issuing.");
      return;
    }

    const signedAt = new Date();
    const ok = await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/ppe/issue", "POST", {
        personnelId: recipientId,
        itemId: ppeForm.itemId,
        locationId: ppeForm.locationId,
        quantity: Number(ppeForm.quantity) || 1,
        departmentId: departmentId || undefined,
        recipientPrintedName: recipientName,
        recipientSignatureDataUrl,
      });

      setPpeForm({
        personnelId: "",
        itemId: "",
        locationId: "",
        quantity: "1",
        departmentId: "",
        recipientName: "",
        recipientSignatureDataUrl: "",
        printAcknowledgment: shouldPrint,
      });
    }, "PPE issued");

    if (ok && shouldPrint) {
      const blocked = printSupplyIssueAcknowledgment({
        title: "PPE Issue Acknowledgment",
        tenantName: tenantDisplayName,
        recipientName: recipientName || undefined,
        recipientId: recipientId || undefined,
        recipientSignatureDataUrl,
        recipientSignedAt: signedAt,
        facilityName: orgSiteId ? siteNameById.get(orgSiteId) : undefined,
        divisionName: orgDivisionName || undefined,
        departmentName: departmentName || undefined,
        issuedBy: issuedByLabel || undefined,
        lines: printLines,
      });
      if (blocked) {
        setError(blocked);
      } else {
        setSuccess("PPE issued — acknowledgment opened for printing.");
      }
    }
  }

  async function returnPpe(assignmentId: string) {
    await runAction(async () => {
      await apiSend(`/api/v1/industrial/supplies/ppe/${assignmentId}/return`, "POST", {
        condition: ppeReturnCondition,
        disposition: "RETURN_TO_STOCK",
      });
    }, "PPE returned");
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/transfer", "POST", {
        sourceLocationId: transferForm.sourceLocationId,
        destinationLocationId: transferForm.destinationLocationId,
        itemId: transferForm.itemId,
        quantity: Number(transferForm.quantity),
        departmentId: transferForm.departmentId || orgDepartmentId || undefined,
      });
      setTransferForm({
        sourceLocationId: String(settings?.settings?.defaultSourceLocationId ?? "").trim(),
        destinationLocationId: String(
          settings?.settings?.defaultDestinationLocationId ?? "",
        ).trim(),
        itemId: "",
        quantity: "1",
        departmentId: "",
      });
    }, "Transfer completed");
  }

  async function createRequest(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/requests", "POST", {
        locationId: requestForm.locationId || undefined,
        departmentId: requestForm.departmentId || orgDepartmentId || undefined,
        reason: requestForm.reason.trim() || undefined,
        items: [{ itemId: requestForm.itemId, quantity: Number(requestForm.quantity) }],
      });
      setRequestForm({
        itemId: "",
        quantity: "1",
        locationId: "",
        reason: "",
        departmentId: "",
      });
    }, "Request submitted");
  }

  async function createVendor(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/vendors", "POST", {
        name: vendorForm.name.trim(),
        phone: vendorForm.phone.trim() || undefined,
        email: vendorForm.email.trim() || undefined,
      });
      setVendorForm({ name: "", phone: "", email: "" });
    }, "Vendor created");
  }

  async function createPurchaseOrder(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/purchase-orders", "POST", {
        vendorId: poForm.vendorId,
        shipToLocationId: poForm.shipToLocationId || undefined,
        items: [
          {
            itemId: poForm.itemId,
            quantity: Number(poForm.quantity),
            unitPrice: Number(poForm.unitPrice) || 0,
          },
        ],
      });
      setPoForm({
        vendorId: "",
        shipToLocationId: "",
        itemId: "",
        quantity: "1",
        unitPrice: "0",
      });
    }, "Purchase order created");
  }

  async function createKit(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/kits", "POST", {
        name: kitForm.name.trim(),
        kitType: kitForm.kitType,
        locationId: kitForm.locationId || undefined,
        items: kitForm.itemId
          ? [{ itemId: kitForm.itemId, expectedQuantity: Number(kitForm.expectedQuantity) || 1 }]
          : [],
      });
      setKitForm({
        name: "",
        kitType: "FIRST_AID",
        locationId: "",
        itemId: "",
        expectedQuantity: "1",
      });
    }, "Kit created");
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await runAction(async () => {
      await apiSend("/api/v1/industrial/supplies/categories", "POST", {
        name: newCategoryName.trim(),
      });
      setNewCategoryName("");
    }, "Category created");
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const locationTypes = locationTypesFromSettings(settings);
    const defaultLocationType = defaultLocationTypeFromSettings(settings);
    const payload: SupplySettings = {
      ...settings,
      settings: {
        ...(settings.settings ?? {}),
        locationTypes,
        defaultLocationType,
        defaultSourceLocationId: settings.settings?.defaultSourceLocationId || null,
        defaultDestinationLocationId: settings.settings?.defaultDestinationLocationId || null,
      },
    };
    await runAction(async () => {
      const updated = await apiSend<SupplySettings>(
        "/api/v1/industrial/supplies/settings",
        "PATCH",
        payload,
      );
      setSettings(updated);
      setLocationForm((prev) => ({
        ...prev,
        locationType: defaultLocationTypeFromSettings(updated),
      }));
    }, "Settings saved");
  }

  function updateSettingsExtras(patch: Partial<NonNullable<SupplySettings["settings"]>>) {
    if (!settings) return;
    setSettings({
      ...settings,
      settings: {
        ...(settings.settings ?? {}),
        ...patch,
      },
    });
  }

  function addLocationTypeOption() {
    const next = normalizeLocationTypeLabel(newLocationType);
    if (!next || !settings) return;
    const current = locationTypesFromSettings(settings);
    if (current.includes(next)) {
      setNewLocationType("");
      return;
    }
    updateSettingsExtras({
      locationTypes: [...current, next],
      defaultLocationType: settings.settings?.defaultLocationType || next,
    });
    setNewLocationType("");
  }

  function removeLocationTypeOption(value: string) {
    if (!settings) return;
    const current = locationTypesFromSettings(settings).filter((row) => row !== value);
    const fallback = current[0] ?? "SUPPLY_ROOM";
    const defaultLocationType =
      settings.settings?.defaultLocationType === value
        ? fallback
        : defaultLocationTypeFromSettings({
            ...settings,
            settings: { ...(settings.settings ?? {}), locationTypes: current },
          });
    updateSettingsExtras({
      locationTypes: current.length > 0 ? current : [...LOCATION_TYPES],
      defaultLocationType,
    });
  }

  function itemOptions() {
    return items.map((item) => (
      <option key={item.id} value={item.id}>
        {item.name} ({item.itemNumber})
      </option>
    ));
  }

  function locationOptions(scoped = false) {
    const list = scoped ? locationsForOrgSite : locations;
    return list.map((loc) => (
      <option key={loc.id} value={loc.id}>
        {loc.name} ({loc.code})
        {loc.siteId && siteNameById.get(loc.siteId) ? ` — ${siteNameById.get(loc.siteId)}` : ""}
      </option>
    ));
  }

  function orgCascadeFields() {
    return (
      <div className="border rounded p-3 mb-3 bg-light">
        <div className="fw-semibold small mb-2">Location / Division / Department</div>
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="supplies-org-site">
              Facility location
            </label>
            <select
              id="supplies-org-site"
              className="form-select form-select-sm"
              value={orgSiteId}
              onChange={(e) =>
                setOrgCascade({ siteId: e.target.value, divisionName: "", departmentId: "" })
              }
            >
              <option value="">All / any</option>
              {facilitySites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="supplies-org-division">
              Division
            </label>
            <select
              id="supplies-org-division"
              className="form-select form-select-sm"
              value={orgDivisionName}
              onChange={(e) => setOrgCascade({ divisionName: e.target.value, departmentId: "" })}
              disabled={!orgSiteId}
            >
              <option value="">{orgSiteId ? "Select division" : "Select location first"}</option>
              {divisionOptions.map((d) => (
                <option key={`${d.siteId ?? ""}-${d.name}`} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="supplies-org-department">
              Department
            </label>
            <select
              id="supplies-org-department"
              className="form-select form-select-sm"
              value={orgDepartmentId}
              onChange={(e) => setOrgCascade({ departmentId: e.target.value })}
              disabled={!orgSiteId || !orgDivisionName}
            >
              <option value="">
                {orgDivisionName ? "Select department" : "Select division first"}
              </option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-walkthrough="safety-supplies-overview">
      <ModuleWorkspaceHeader
        title={moduleName}
        description="Manage safety supply inventory, PPE issuance, receiving, and replenishment."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="alert alert-success" role="status">
          {success}
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Safety Supplies sections"
      >
        {tab === "dashboard" ? (
          <div className="row g-3">
            <KpiCard label="Open supply requests" value={requestAnalytics?.openRequests ?? 0} />
            <KpiCard label="Urgent requests" value={requestAnalytics?.urgentRequests ?? 0} />
            <KpiCard label="Ready for pickup" value={requestAnalytics?.readyForPickup ?? 0} />
            <KpiCard label="Fulfilled today" value={requestAnalytics?.fulfilledToday ?? 0} />
            <KpiCard label="QR scans" value={requestAnalytics?.totalScans ?? 0} />
            <KpiCard
              label="QR conversion"
              value={
                requestAnalytics?.conversionRate != null
                  ? `${Math.round(requestAnalytics.conversionRate * 100)}%`
                  : "—"
              }
            />
            <KpiCard label="Inventory value" value={dashboard?.totalInventoryValue ?? 0} />
            <KpiCard label="Inventory items" value={dashboard?.totalInventoryItems ?? 0} />
            <KpiCard label="Low stock" value={dashboard?.lowStockItems ?? 0} />
            <KpiCard label="Out of stock" value={dashboard?.outOfStockItems ?? 0} />
            <KpiCard label="Expiring soon" value={dashboard?.expiringSoon ?? 0} />
            <KpiCard label="Expired" value={dashboard?.expiredItems ?? 0} />
            <KpiCard label="Pending requests" value={dashboard?.pendingRequests ?? 0} />
            <KpiCard label="Open POs" value={dashboard?.openPurchaseOrders ?? 0} />
            <KpiCard
              label="Received this month"
              value={dashboard?.suppliesReceivedThisMonth ?? 0}
            />
            <KpiCard label="Issued this month" value={dashboard?.suppliesIssuedThisMonth ?? 0} />
            <KpiCard label="Adjustments" value={dashboard?.inventoryAdjustments ?? 0} />
            <KpiCard label="Damaged equipment" value={dashboard?.damagedEquipment ?? 0} />
            <KpiCard
              label="Awaiting inspection"
              value={dashboard?.equipmentAwaitingInspection ?? 0}
            />
            <KpiCard label="PPE assignments" value={dashboard?.employeePpeAssignments ?? 0} />
            <KpiCard label="Categories" value={dashboard?.categoryCount ?? 0} />
            {requestAnalytics?.topQrStations?.length ? (
              <div className="col-12">
                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">Top QR request stations</h6>
                  </div>
                  <div className="table-responsive">
                    <table className="table mb-0">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Scans</th>
                          <th>Requests</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestAnalytics.topQrStations.map((station) => (
                          <tr key={station.id}>
                            <td>{station.name}</td>
                            <td>{station.scanCount}</td>
                            <td>{station.requestCount ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "inventory" ? (
          <div className="card">
            <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
              <h5 className="mb-0">Inventory by location</h5>
              <input
                className="form-control form-control-sm"
                style={{ maxWidth: 280 }}
                placeholder="Search item or location"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                aria-label="Search inventory"
              />
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Location</th>
                    <th>On hand</th>
                    <th>Available</th>
                    <th>Reserved</th>
                    <th>Reorder point</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.itemName}
                        {row.itemNumber ? (
                          <div className="small text-muted">{row.itemNumber}</div>
                        ) : null}
                      </td>
                      <td>
                        {row.locationName}
                        {row.locationCode ? (
                          <div className="small text-muted">{row.locationCode}</div>
                        ) : null}
                      </td>
                      <td>{qty(row.quantityOnHand)}</td>
                      <td>{qty(row.quantityAvailable)}</td>
                      <td>{qty(row.quantityReserved)}</td>
                      <td>{qty(row.reorderPoint)}</td>
                    </tr>
                  ))}
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        No inventory rows found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "items" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Item master</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Number</th>
                        <th>Type</th>
                        <th>UOM</th>
                        <th>Reorder</th>
                        {showItemActions ? <th scope="col">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>
                            <code>{item.itemNumber}</code>
                          </td>
                          <td>{item.inventoryType}</td>
                          <td>{item.unitOfMeasure}</td>
                          <td>{qty(item.reorderPoint)}</td>
                          {showItemActions ? (
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                {canPrinterPrint ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={saving}
                                    onClick={() => setBridgePrintItem(item)}
                                  >
                                    Print label (bridge)
                                  </button>
                                ) : null}
                                {canQrPrint ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={saving || qrPrintingId === item.id}
                                    onClick={() => void printItemQr(item)}
                                  >
                                    {qrPrintingId === item.id ? "Printing…" : "Print QR"}
                                  </button>
                                ) : null}
                                {canDeleteItems ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={saving || qrPrintingId === item.id}
                                    onClick={() => void deleteItem(item)}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={showItemActions ? 6 : 5} className="text-muted">
                            No items yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Create item</h5>
                  <form onSubmit={(e) => void createItem(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssi-name">
                        Name
                      </label>
                      <input
                        id="ssi-name"
                        className="form-control"
                        value={itemForm.name}
                        onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssi-number">
                        Item number (optional)
                      </label>
                      <input
                        id="ssi-number"
                        className="form-control"
                        value={itemForm.itemNumber}
                        onChange={(e) => setItemForm({ ...itemForm, itemNumber: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssi-type">
                        Inventory type
                      </label>
                      <select
                        id="ssi-type"
                        className="form-select"
                        value={itemForm.inventoryType}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, inventoryType: e.target.value })
                        }
                      >
                        {INVENTORY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssi-category">
                        Category
                      </label>
                      <select
                        id="ssi-category"
                        className="form-select"
                        value={itemForm.categoryId}
                        onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                      >
                        <option value="">None</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssi-uom">
                        Unit of measure
                      </label>
                      <input
                        id="ssi-uom"
                        className="form-control"
                        value={itemForm.unitOfMeasure}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, unitOfMeasure: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <label className="form-label" htmlFor="ssi-reorder">
                          Reorder point
                        </label>
                        <input
                          id="ssi-reorder"
                          type="number"
                          min={0}
                          step="any"
                          className="form-control"
                          value={itemForm.reorderPoint}
                          onChange={(e) =>
                            setItemForm({ ...itemForm, reorderPoint: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label" htmlFor="ssi-min">
                          Minimum quantity
                        </label>
                        <input
                          id="ssi-min"
                          type="number"
                          min={0}
                          step="any"
                          className="form-control"
                          value={itemForm.minimumQuantity}
                          onChange={(e) =>
                            setItemForm({ ...itemForm, minimumQuantity: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving…" : "Create item"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "locations" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Locations</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Facility</th>
                        <th>Type</th>
                        <th>Status</th>
                        {canManageLocations ? <th className="text-end">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLocations.map((loc) => (
                        <tr key={loc.id}>
                          <td>
                            <code>{loc.code}</code>
                          </td>
                          <td>{loc.name}</td>
                          <td>{loc.siteId ? (siteNameById.get(loc.siteId) ?? loc.siteId) : "—"}</td>
                          <td>{loc.locationType}</td>
                          <td>{loc.status ?? "ACTIVE"}</td>
                          {canManageLocations ? (
                            <td className="text-end text-nowrap">
                              {canPrinterPrint || canQrPrint ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary me-1"
                                  disabled={saving}
                                  title="Print this location’s supply-request QR via Forge (QR Supply Requests)"
                                  onClick={() => {
                                    setTab("qr-stations");
                                    setSuccess(
                                      `Open Print label on the QR station for “${loc.name}”. If none exists, generate one linked to this location.`,
                                    );
                                  }}
                                >
                                  Print QR
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary me-1"
                                disabled={saving}
                                onClick={() => beginEditLocation(loc)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={saving}
                                onClick={() => void deleteLocation(loc)}
                              >
                                Delete
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                      {visibleLocations.length === 0 ? (
                        <tr>
                          <td colSpan={canManageLocations ? 6 : 5} className="text-muted">
                            No locations yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">
                    {editingLocationId ? "Edit location" : "Create location"}
                  </h5>
                  <form onSubmit={(e) => void saveLocation(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssl-site">
                        Facility location
                      </label>
                      <select
                        id="ssl-site"
                        className="form-select"
                        value={locationForm.siteId}
                        onChange={(e) => {
                          const siteId = e.target.value;
                          const site = facilitySitesForLocations.find((s) => s.id === siteId);
                          setLocationForm({
                            ...locationForm,
                            siteId,
                            name:
                              locationForm.name.trim() ||
                              (site ? `${site.label} Supply Room` : locationForm.name),
                            code:
                              locationForm.code.trim() ||
                              (site
                                ? site.label
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]+/g, "-")
                                    .replace(/^-+|-+$/g, "")
                                    .slice(0, 64)
                                : locationForm.code),
                          });
                        }}
                      >
                        <option value="">Optional — link to plant location</option>
                        {facilitySitesForLocations.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.label}
                          </option>
                        ))}
                        {locationForm.siteId &&
                        !facilitySitesForLocations.some((s) => s.id === locationForm.siteId) ? (
                          <option value={locationForm.siteId}>
                            {siteNameById.get(locationForm.siteId) ?? locationForm.siteId}
                          </option>
                        ) : null}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssl-code">
                        Code
                      </label>
                      <input
                        id="ssl-code"
                        className="form-control"
                        value={locationForm.code}
                        onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssl-name">
                        Name
                      </label>
                      <input
                        id="ssl-name"
                        className="form-control"
                        value={locationForm.name}
                        onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ssl-type">
                        Location type
                      </label>
                      <select
                        id="ssl-type"
                        className="form-select"
                        value={locationForm.locationType}
                        onChange={(e) =>
                          setLocationForm({ ...locationForm, locationType: e.target.value })
                        }
                      >
                        {locationTypesFromSettings(settings).map((t) => (
                          <option key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={
                          saving ||
                          (Boolean(editingLocationId) && !canManageLocations) ||
                          (!editingLocationId && !suppliesManage && !canManageLocations)
                        }
                      >
                        {saving
                          ? "Saving…"
                          : editingLocationId
                            ? "Save changes"
                            : "Create location"}
                      </button>
                      {editingLocationId ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={saving}
                          onClick={cancelEditLocation}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "receive" ? (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-header">
              <h5 className="mb-0">Receive supplies</h5>
            </div>
            <div className="card-body">
              <form onSubmit={(e) => void submitReceive(e)}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-item">
                    Item
                  </label>
                  <select
                    id="recv-item"
                    className="form-select"
                    value={receiveForm.itemId}
                    onChange={(e) => setReceiveForm({ ...receiveForm, itemId: e.target.value })}
                    required
                  >
                    <option value="">Select item</option>
                    {itemOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-loc">
                    Location
                  </label>
                  <select
                    id="recv-loc"
                    className="form-select"
                    value={receiveForm.locationId}
                    onChange={(e) => setReceiveForm({ ...receiveForm, locationId: e.target.value })}
                    required
                  >
                    <option value="">Select location</option>
                    {locationOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-qty">
                    Quantity
                  </label>
                  <input
                    id="recv-qty"
                    type="number"
                    min={0.0001}
                    step="any"
                    className="form-control"
                    value={receiveForm.quantity}
                    onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-lot">
                    Lot number (optional)
                  </label>
                  <input
                    id="recv-lot"
                    className="form-control"
                    value={receiveForm.lotNumber}
                    onChange={(e) => setReceiveForm({ ...receiveForm, lotNumber: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-exp">
                    Expiration date (optional)
                  </label>
                  <input
                    id="recv-exp"
                    type="date"
                    className="form-control"
                    value={receiveForm.expirationDate}
                    onChange={(e) =>
                      setReceiveForm({ ...receiveForm, expirationDate: e.target.value })
                    }
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="recv-cost">
                    Unit cost (optional)
                  </label>
                  <input
                    id="recv-cost"
                    type="number"
                    min={0}
                    step="any"
                    className="form-control"
                    value={receiveForm.unitCost}
                    onChange={(e) => setReceiveForm({ ...receiveForm, unitCost: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Receiving…" : "Receive"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {tab === "issue" ? (
          <div className="card" style={{ maxWidth: 720 }}>
            <div className="card-header">
              <h5 className="mb-0">Issue supplies</h5>
            </div>
            <div className="card-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitIssue(e);
                }}
              >
                {orgCascadeFields()}
                <div className="mb-3">
                  <label className="form-label" htmlFor="iss-recipient">
                    Recipient printed name
                  </label>
                  <input
                    id="iss-recipient"
                    className="form-control"
                    value={issueForm.recipientName}
                    onChange={(e) => setIssueForm({ ...issueForm, recipientName: e.target.value })}
                    placeholder="Print the recipient’s full name"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="iss-person">
                    Personnel ID (optional)
                  </label>
                  <input
                    id="iss-person"
                    className="form-control"
                    value={issueForm.personnelId}
                    onChange={(e) => setIssueForm({ ...issueForm, personnelId: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <SignaturePad
                    label="Recipient signature"
                    value={issueForm.recipientSignatureDataUrl}
                    onChange={(dataUrl) =>
                      setIssueForm({ ...issueForm, recipientSignatureDataUrl: dataUrl })
                    }
                    disabled={saving}
                  />
                  <div className="form-text">
                    Have the person receiving the items sign here before you issue.
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="iss-item">
                    Item
                  </label>
                  <select
                    id="iss-item"
                    className="form-select"
                    value={issueForm.itemId}
                    onChange={(e) => setIssueForm({ ...issueForm, itemId: e.target.value })}
                  >
                    <option value="">Select item</option>
                    {itemOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="iss-loc">
                    Storage location
                  </label>
                  <select
                    id="iss-loc"
                    className="form-select"
                    value={issueForm.locationId}
                    onChange={(e) => setIssueForm({ ...issueForm, locationId: e.target.value })}
                  >
                    <option value="">Select location</option>
                    {locationOptions(true)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="iss-qty">
                    Quantity
                  </label>
                  <input
                    id="iss-qty"
                    type="number"
                    min={0.0001}
                    step="any"
                    className="form-control"
                    value={issueForm.quantity}
                    onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })}
                  />
                </div>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={saving}
                    onClick={addIssueLine}
                  >
                    Add to list
                  </button>
                </div>

                {issueLines.length > 0 ? (
                  <div className="table-responsive mb-3">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Location</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {issueLines.map((line, idx) => (
                          <tr key={`${line.itemId}-${idx}`}>
                            <td>
                              {line.itemName}
                              {line.itemNumber ? (
                                <div className="small text-muted">{line.itemNumber}</div>
                              ) : null}
                            </td>
                            <td>{qty(line.quantity)}</td>
                            <td className="small">{line.locationName}</td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() =>
                                  setIssueLines((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted small">
                    Add one or more items to the list, or fill the form and issue a single item
                    directly.
                  </p>
                )}

                <div className="form-check mb-3">
                  <input
                    id="iss-print"
                    className="form-check-input"
                    type="checkbox"
                    checked={issueForm.printAcknowledgment}
                    onChange={(e) =>
                      setIssueForm({ ...issueForm, printAcknowledgment: e.target.checked })
                    }
                  />
                  <label className="form-check-label" htmlFor="iss-print">
                    Print a signed acknowledgment after issuing
                  </label>
                </div>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? "Issuing…"
                    : issueForm.printAcknowledgment
                      ? "Issue & print acknowledgment"
                      : "Issue"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {tab === "ppe" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
                  <h5 className="mb-0">PPE assignments</h5>
                  <div className="d-flex align-items-center gap-2">
                    <label className="form-label mb-0 small" htmlFor="ppe-return-cond">
                      Return condition
                    </label>
                    <select
                      id="ppe-return-cond"
                      className="form-select form-select-sm"
                      style={{ width: "auto" }}
                      value={ppeReturnCondition}
                      onChange={(e) => setPpeReturnCondition(e.target.value)}
                    >
                      {PPE_RETURN_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Personnel</th>
                        <th>Qty</th>
                        <th>Issued</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ppe.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.itemName ?? row.itemId}
                            {row.itemNumber ? (
                              <div className="small text-muted">{row.itemNumber}</div>
                            ) : null}
                          </td>
                          <td>
                            <code className="small">{row.personnelId}</code>
                          </td>
                          <td>{qty(row.quantity)}</td>
                          <td>{row.issueDate ?? "—"}</td>
                          <td>
                            <span className="badge bg-label-secondary">{row.status}</span>
                          </td>
                          <td className="text-end">
                            {row.status === "ASSIGNED" ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={saving}
                                onClick={() => void returnPpe(row.id)}
                              >
                                Return
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {ppe.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-muted">
                            No PPE assignments.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Issue PPE</h5>
                  <form onSubmit={(e) => void submitPpeIssue(e)}>
                    {orgCascadeFields()}
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ppe-recipient">
                        Recipient printed name
                      </label>
                      <input
                        id="ppe-recipient"
                        className="form-control"
                        value={ppeForm.recipientName}
                        onChange={(e) => setPpeForm({ ...ppeForm, recipientName: e.target.value })}
                        placeholder="Print the recipient’s full name"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ppe-person">
                        Personnel ID
                      </label>
                      <input
                        id="ppe-person"
                        className="form-control"
                        value={ppeForm.personnelId}
                        onChange={(e) => setPpeForm({ ...ppeForm, personnelId: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <SignaturePad
                        label="Recipient signature"
                        value={ppeForm.recipientSignatureDataUrl}
                        onChange={(dataUrl) =>
                          setPpeForm({ ...ppeForm, recipientSignatureDataUrl: dataUrl })
                        }
                        disabled={saving}
                      />
                      <div className="form-text">
                        Have the person receiving the PPE sign here before you issue.
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ppe-item">
                        Item
                      </label>
                      <select
                        id="ppe-item"
                        className="form-select"
                        value={ppeForm.itemId}
                        onChange={(e) => setPpeForm({ ...ppeForm, itemId: e.target.value })}
                        required
                      >
                        <option value="">Select item</option>
                        {itemOptions()}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ppe-loc">
                        From location
                      </label>
                      <select
                        id="ppe-loc"
                        className="form-select"
                        value={ppeForm.locationId}
                        onChange={(e) => setPpeForm({ ...ppeForm, locationId: e.target.value })}
                        required
                      >
                        <option value="">Select location</option>
                        {locationOptions(true)}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ppe-qty">
                        Quantity
                      </label>
                      <input
                        id="ppe-qty"
                        type="number"
                        min={0.0001}
                        step="any"
                        className="form-control"
                        value={ppeForm.quantity}
                        onChange={(e) => setPpeForm({ ...ppeForm, quantity: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-check mb-3">
                      <input
                        id="ppe-print"
                        className="form-check-input"
                        type="checkbox"
                        checked={ppeForm.printAcknowledgment}
                        onChange={(e) =>
                          setPpeForm({ ...ppeForm, printAcknowledgment: e.target.checked })
                        }
                      />
                      <label className="form-check-label" htmlFor="ppe-print">
                        Print a signed acknowledgment after issuing
                      </label>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving
                        ? "Issuing…"
                        : ppeForm.printAcknowledgment
                          ? "Issue PPE & print"
                          : "Issue PPE"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "transfers" ? (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-header">
              <h5 className="mb-0">Transfer inventory</h5>
            </div>
            <div className="card-body">
              <form onSubmit={(e) => void submitTransfer(e)}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="tr-src">
                    Source location
                  </label>
                  <select
                    id="tr-src"
                    className="form-select"
                    value={transferForm.sourceLocationId}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, sourceLocationId: e.target.value })
                    }
                    required
                  >
                    <option value="">Select source</option>
                    {locationOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="tr-dst">
                    Destination location
                  </label>
                  <select
                    id="tr-dst"
                    className="form-select"
                    value={transferForm.destinationLocationId}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, destinationLocationId: e.target.value })
                    }
                    required
                  >
                    <option value="">Select destination</option>
                    {locationOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="tr-item">
                    Item
                  </label>
                  <select
                    id="tr-item"
                    className="form-select"
                    value={transferForm.itemId}
                    onChange={(e) => setTransferForm({ ...transferForm, itemId: e.target.value })}
                    required
                  >
                    <option value="">Select item</option>
                    {itemOptions()}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="tr-qty">
                    Quantity
                  </label>
                  <input
                    id="tr-qty"
                    type="number"
                    min={0.0001}
                    step="any"
                    className="form-control"
                    value={transferForm.quantity}
                    onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="tr-dept">
                    Department (optional)
                  </label>
                  <select
                    id="tr-dept"
                    className="form-select"
                    value={transferForm.departmentId || orgDepartmentId}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, departmentId: e.target.value })
                    }
                  >
                    <option value="">Unassigned</option>
                    {orgDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <div className="form-text">
                    Used for monthly issued/transferred-by-department reporting.
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Transferring…" : "Transfer"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {tab === "requests" ? (
          <SafetySupplyRequestsPanel
            requests={requests}
            locations={locations}
            inventory={inventory}
            approveLocationId={approveLocationId}
            onApproveLocationChange={setApproveLocationId}
            locationOptions={locationOptions(true)}
            orgCascadeFields={orgCascadeFields}
            requestForm={requestForm}
            setRequestForm={setRequestForm}
            itemOptions={itemOptions}
            onCreateRequest={createRequest}
            onRefresh={async () => {
              await loadTabData("requests");
              const analytics = await apiGet<RequestAnalytics>(
                "/api/v1/industrial/supplies/request-analytics",
              ).catch(() => null);
              setRequestAnalytics(analytics);
            }}
            saving={saving}
            initialRequestId={deepLinkRequestId}
          />
        ) : null}

        {tab === "qr-stations" ? (
          <SafetySupplyQrStationsPanel
            sites={facilitySites}
            locations={locations}
            canManage={
              suppliesManage ||
              permissions.has("industrial.supplies.qr.create") ||
              permissions.has("industrial.supplies.qr.edit")
            }
            canPrintLabel={canPrinterPrint || canQrPrint}
          />
        ) : null}

        {tab === "vendors" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Vendors</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <code>{v.vendorNumber}</code>
                          </td>
                          <td>{v.name}</td>
                          <td>{v.phone ?? "—"}</td>
                          <td>{v.email ?? "—"}</td>
                        </tr>
                      ))}
                      {vendors.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No vendors yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Create vendor</h5>
                  <form onSubmit={(e) => void createVendor(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ven-name">
                        Name
                      </label>
                      <input
                        id="ven-name"
                        className="form-control"
                        value={vendorForm.name}
                        onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ven-phone">
                        Phone
                      </label>
                      <input
                        id="ven-phone"
                        className="form-control"
                        value={vendorForm.phone}
                        onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="ven-email">
                        Email
                      </label>
                      <input
                        id="ven-email"
                        type="email"
                        className="form-control"
                        value={vendorForm.email}
                        onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving…" : "Create vendor"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "purchase-orders" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Purchase orders</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>PO</th>
                        <th>Vendor</th>
                        <th>Status</th>
                        <th>Total</th>
                        <th>Order date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((po) => (
                        <tr key={po.id}>
                          <td>
                            <code>{po.poNumber}</code>
                          </td>
                          <td>{po.vendorName ?? po.vendorId}</td>
                          <td>
                            <span className="badge bg-label-secondary">{po.status}</span>
                          </td>
                          <td>{qty(po.total)}</td>
                          <td>{po.orderDate ?? "—"}</td>
                        </tr>
                      ))}
                      {purchaseOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No purchase orders yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Create purchase order</h5>
                  <form onSubmit={(e) => void createPurchaseOrder(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="po-vendor">
                        Vendor
                      </label>
                      <select
                        id="po-vendor"
                        className="form-select"
                        value={poForm.vendorId}
                        onChange={(e) => setPoForm({ ...poForm, vendorId: e.target.value })}
                        required
                      >
                        <option value="">Select vendor</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="po-ship">
                        Ship-to location
                      </label>
                      <select
                        id="po-ship"
                        className="form-select"
                        value={poForm.shipToLocationId}
                        onChange={(e) => setPoForm({ ...poForm, shipToLocationId: e.target.value })}
                      >
                        <option value="">None</option>
                        {locationOptions()}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="po-item">
                        Item
                      </label>
                      <select
                        id="po-item"
                        className="form-select"
                        value={poForm.itemId}
                        onChange={(e) => setPoForm({ ...poForm, itemId: e.target.value })}
                        required
                      >
                        <option value="">Select item</option>
                        {itemOptions()}
                      </select>
                    </div>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <label className="form-label" htmlFor="po-qty">
                          Quantity
                        </label>
                        <input
                          id="po-qty"
                          type="number"
                          min={0.0001}
                          step="any"
                          className="form-control"
                          value={poForm.quantity}
                          onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label" htmlFor="po-price">
                          Unit price
                        </label>
                        <input
                          id="po-price"
                          type="number"
                          min={0}
                          step="any"
                          className="form-control"
                          value={poForm.unitPrice}
                          onChange={(e) => setPoForm({ ...poForm, unitPrice: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Creating…" : "Create PO"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "reorder" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Reorder center</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Location</th>
                    <th>Available</th>
                    <th>Reorder point</th>
                    <th>Suggested qty</th>
                  </tr>
                </thead>
                <tbody>
                  {reorder.map((row) => (
                    <tr key={`${row.itemId}-${row.locationId}`}>
                      <td>
                        {row.itemName}
                        <div className="small text-muted">{row.itemNumber}</div>
                      </td>
                      <td>
                        {row.locationName}
                        <div className="small text-muted">{row.locationCode}</div>
                      </td>
                      <td>{qty(row.quantityAvailable)}</td>
                      <td>{qty(row.reorderPoint)}</td>
                      <td>{qty(row.suggestedOrderQuantity)}</td>
                    </tr>
                  ))}
                  {reorder.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted">
                        Nothing below reorder point.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "expiring" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Expiring lots (next 90 days)</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Lot</th>
                    <th>Qty</th>
                    <th>Expiration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((lot) => (
                    <tr key={lot.id}>
                      <td>
                        {lot.itemName ?? lot.itemId}
                        {lot.itemNumber ? (
                          <div className="small text-muted">{lot.itemNumber}</div>
                        ) : null}
                      </td>
                      <td>
                        <code>{lot.lotNumber}</code>
                      </td>
                      <td>{qty(lot.quantity)}</td>
                      <td>{lot.expirationDate ?? "—"}</td>
                      <td>{lot.status ?? "CURRENT"}</td>
                    </tr>
                  ))}
                  {expiring.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted">
                        No lots expiring soon.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "kits" ? (
          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Kits</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kits.map((kit) => (
                        <tr key={kit.id}>
                          <td>
                            <code>{kit.kitNumber}</code>
                          </td>
                          <td>{kit.name}</td>
                          <td>{kit.kitType}</td>
                          <td>{kit.status}</td>
                        </tr>
                      ))}
                      {kits.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No kits yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Create kit</h5>
                  <form onSubmit={(e) => void createKit(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="kit-name">
                        Name
                      </label>
                      <input
                        id="kit-name"
                        className="form-control"
                        value={kitForm.name}
                        onChange={(e) => setKitForm({ ...kitForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="kit-type">
                        Kit type
                      </label>
                      <select
                        id="kit-type"
                        className="form-select"
                        value={kitForm.kitType}
                        onChange={(e) => setKitForm({ ...kitForm, kitType: e.target.value })}
                      >
                        <option value="FIRST_AID">FIRST_AID</option>
                        <option value="SPILL">SPILL</option>
                        <option value="PPE">PPE</option>
                        <option value="CUSTOM">CUSTOM</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="kit-loc">
                        Location (optional)
                      </label>
                      <select
                        id="kit-loc"
                        className="form-select"
                        value={kitForm.locationId}
                        onChange={(e) => setKitForm({ ...kitForm, locationId: e.target.value })}
                      >
                        <option value="">None</option>
                        {locationOptions()}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="kit-item">
                        First kit item (optional)
                      </label>
                      <select
                        id="kit-item"
                        className="form-select"
                        value={kitForm.itemId}
                        onChange={(e) => setKitForm({ ...kitForm, itemId: e.target.value })}
                      >
                        <option value="">None</option>
                        {itemOptions()}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="kit-qty">
                        Expected quantity
                      </label>
                      <input
                        id="kit-qty"
                        type="number"
                        min={0.0001}
                        step="any"
                        className="form-control"
                        value={kitForm.expectedQuantity}
                        onChange={(e) =>
                          setKitForm({ ...kitForm, expectedQuantity: e.target.value })
                        }
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving…" : "Create kit"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "transactions" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Transactions</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id}>
                      <td className="small text-muted">
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleString() : "—"}
                      </td>
                      <td>
                        <span className="badge bg-label-secondary">{txn.transactionType}</span>
                      </td>
                      <td>
                        {txn.itemName ?? txn.itemId}
                        {txn.itemNumber ? (
                          <div className="small text-muted">{txn.itemNumber}</div>
                        ) : null}
                      </td>
                      <td>{qty(txn.quantity)}</td>
                      <td>{qty(txn.previousQuantity)}</td>
                      <td>{qty(txn.newQuantity)}</td>
                      <td className="small text-muted">{txn.reason ?? "—"}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "reports" ? (
          <>
            <div className="alert alert-info mb-3" role="status">
              Use the <a href="/reporting/library/?q=supplies">Reporting Center</a> for exports, or
              turn on the monthly department email under{" "}
              <button
                type="button"
                className="btn btn-link p-0 align-baseline"
                onClick={() => setTab("settings")}
              >
                Settings
              </button>
              . Other recurring emails live under{" "}
              <a href="/reporting/scheduled/">Reporting → Scheduled</a>.
            </div>
            {requestAnalytics ? (
              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="mb-0">QR request usage</h5>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <KpiCard label="Open requests" value={requestAnalytics.openRequests} />
                    <KpiCard label="Urgent" value={requestAnalytics.urgentRequests} />
                    <KpiCard label="Ready for pickup" value={requestAnalytics.readyForPickup} />
                    <KpiCard label="Fulfilled today" value={requestAnalytics.fulfilledToday} />
                    <KpiCard label="Total scans" value={requestAnalytics.totalScans ?? 0} />
                    <KpiCard
                      label="QR → request conversion"
                      value={
                        requestAnalytics.conversionRate != null
                          ? `${Math.round(requestAnalytics.conversionRate * 100)}%`
                          : "—"
                      }
                    />
                  </div>
                  {requestAnalytics.topQrStations?.length ? (
                    <div className="table-responsive mt-3">
                      <table className="table mb-0">
                        <thead>
                          <tr>
                            <th>Station</th>
                            <th>Scans</th>
                            <th>Requests</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requestAnalytics.topQrStations.map((station) => (
                            <tr key={station.id}>
                              <td>{station.name}</td>
                              <td>{station.scanCount}</td>
                              <td>{station.requestCount ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <SafetySuppliesReportBuilder
              items={items.map((item) => ({
                id: item.id,
                label: item.itemNumber ? `${item.itemNumber} — ${item.name}` : item.name,
              }))}
              locations={locations.map((loc) => ({
                id: loc.id,
                label: loc.code ? `${loc.code} — ${loc.name}` : loc.name,
              }))}
              categories={categories.map((cat) => ({
                id: cat.id,
                label: cat.name,
              }))}
              sites={facilitySites.map((site) => ({
                id: site.id,
                label: site.label,
              }))}
              onError={setError}
            />
          </>
        ) : null}

        {tab === "categories" ? (
          <div className="row g-3">
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Supply categories</h5>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id}>
                          <td>{cat.name}</td>
                          <td>
                            <code>{cat.code}</code>
                          </td>
                          <td>{cat.isSystem ? "System" : "Custom"}</td>
                          <td>{cat.status}</td>
                        </tr>
                      ))}
                      {categories.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No categories yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Add category</h5>
                  <form onSubmit={(e) => void createCategory(e)}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="supply-category-name">
                        Name
                      </label>
                      <input
                        id="supply-category-name"
                        className="form-control"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving…" : "Create category"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "settings" && settings ? (
          <form className="card" onSubmit={(e) => void saveSettings(e)}>
            <div className="card-header">
              <h5 className="mb-0">Safety Supplies settings</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <h6>Inventory</h6>
                  <div className="form-check mb-2">
                    <input
                      id="allow-negative"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.allowNegativeInventory}
                      onChange={(e) =>
                        setSettings({ ...settings, allowNegativeInventory: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="allow-negative">
                      Allow negative inventory
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="require-adj-approval"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requireAdjustmentApproval}
                      onChange={(e) =>
                        setSettings({ ...settings, requireAdjustmentApproval: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="require-adj-approval">
                      Require adjustment approval
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="blind-count"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requireBlindInventoryCount}
                      onChange={(e) =>
                        setSettings({ ...settings, requireBlindInventoryCount: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="blind-count">
                      Require blind inventory count
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="enable-costing"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.enableInventoryCosting}
                      onChange={(e) =>
                        setSettings({ ...settings, enableInventoryCosting: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="enable-costing">
                      Enable inventory costing
                    </label>
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="low-stock">
                      Default low-stock threshold
                    </label>
                    <input
                      id="low-stock"
                      type="number"
                      min={0}
                      className="form-control"
                      value={settings.defaultLowStockThreshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultLowStockThreshold: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <h6>PPE</h6>
                  <div className="form-check mb-2">
                    <input
                      id="require-ack"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requireEmployeeAcknowledgment}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          requireEmployeeAcknowledgment: e.target.checked,
                        })
                      }
                    />
                    <label className="form-check-label" htmlFor="require-ack">
                      Require employee acknowledgment
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="require-return-condition"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requireReturnCondition}
                      onChange={(e) =>
                        setSettings({ ...settings, requireReturnCondition: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="require-return-condition">
                      Require return condition
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="ppe-override"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.allowPpeIssueOverride}
                      onChange={(e) =>
                        setSettings({ ...settings, allowPpeIssueOverride: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="ppe-override">
                      Allow PPE issue override
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="training-verify"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requireTrainingVerification}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          requireTrainingVerification: e.target.checked,
                        })
                      }
                    />
                    <label className="form-check-label" htmlFor="training-verify">
                      Require training verification
                    </label>
                  </div>
                </div>

                <div className="col-md-6">
                  <h6>Purchasing</h6>
                  <div className="form-check mb-2">
                    <input
                      id="enable-pr"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.enablePurchaseRequests}
                      onChange={(e) =>
                        setSettings({ ...settings, enablePurchaseRequests: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="enable-pr">
                      Enable purchase requests
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="enable-po"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.enablePurchaseOrders}
                      onChange={(e) =>
                        setSettings({ ...settings, enablePurchaseOrders: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="enable-po">
                      Enable purchase orders
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="require-po-approval"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.requirePoApproval}
                      onChange={(e) =>
                        setSettings({ ...settings, requirePoApproval: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="require-po-approval">
                      Require PO approval
                    </label>
                  </div>
                </div>

                <div className="col-md-6">
                  <h6>QR / Labels</h6>
                  <div className="form-check mb-2">
                    <input
                      id="auto-qr"
                      className="form-check-input"
                      type="checkbox"
                      checked={settings.autoCreateQrOnItemCreate}
                      onChange={(e) =>
                        setSettings({ ...settings, autoCreateQrOnItemCreate: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="auto-qr">
                      Auto-create QR when item created
                    </label>
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="label-type">
                      Default label type
                    </label>
                    <select
                      id="label-type"
                      className="form-select"
                      value={settings.defaultLabelType}
                      onChange={(e) =>
                        setSettings({ ...settings, defaultLabelType: e.target.value })
                      }
                    >
                      <option value="SMALL_INVENTORY">Small inventory label</option>
                      <option value="EQUIPMENT">Equipment label</option>
                    </select>
                  </div>
                </div>

                <div className="col-md-6">
                  <h6>Notifications</h6>
                  <p className="text-muted small">
                    Dashboard (in-app) alerts for supply request workflow. Email/SMS remain off
                    until configured.
                  </p>
                  {(
                    [
                      ["requestSubmittedInApp", "New request submitted"],
                      ["requestUrgentInApp", "Urgent request submitted"],
                      ["requestAssignedInApp", "Request assigned"],
                      ["requestApprovedInApp", "Request approved"],
                      ["requestDeniedInApp", "Request denied"],
                      ["requestReadyInApp", "Ready for pickup"],
                      ["requestFulfilledInApp", "Request fulfilled"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="form-check mb-2" key={key}>
                      <input
                        id={`notif-${key}`}
                        className="form-check-input"
                        type="checkbox"
                        checked={Boolean(
                          settings.settings?.notifications?.[key] ??
                          (key === "requestSubmittedInApp" || key === "requestUrgentInApp"),
                        )}
                        onChange={(e) =>
                          updateSettingsExtras({
                            notifications: {
                              ...(settings.settings?.notifications ?? {}),
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <label className="form-check-label" htmlFor={`notif-${key}`}>
                        {label}
                      </label>
                    </div>
                  ))}
                  <div className="form-check mb-2">
                    <input
                      id="notif-email"
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(settings.settings?.notifications?.emailEnabled)}
                      disabled
                      onChange={() => undefined}
                    />
                    <label className="form-check-label" htmlFor="notif-email">
                      Email notifications (not available yet)
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="notif-sms"
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(settings.settings?.notifications?.smsEnabled)}
                      disabled
                      onChange={() => undefined}
                    />
                    <label className="form-check-label" htmlFor="notif-sms">
                      SMS notifications (not available yet)
                    </label>
                  </div>
                  <hr className="my-3" />
                  <h6>Monthly department report</h6>
                  <p className="text-muted small">
                    On the 1st of each month at 8:00 AM Central, email last month’s issued and
                    transferred quantities by department to everyone with the Safety Director role.
                    Those people need a real email address on their user profile.
                  </p>
                  <div className="form-check mb-2">
                    <input
                      id="monthly-dept-email"
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(
                        settings.settings?.monthlyDepartmentUsageEmailToSafetyDirectors,
                      )}
                      onChange={(e) =>
                        updateSettingsExtras({
                          monthlyDepartmentUsageEmailToSafetyDirectors: e.target.checked,
                        })
                      }
                    />
                    <label className="form-check-label" htmlFor="monthly-dept-email">
                      Email Safety Directors a monthly department usage report
                    </label>
                  </div>
                  {settings.settings?.monthlyDepartmentUsageScheduleId ? (
                    <p className="small text-muted mb-0">
                      This monthly email is on. You can review it under{" "}
                      <a href="/reporting/scheduled/">Reporting → Scheduled</a>.
                    </p>
                  ) : null}
                </div>

                <div className="col-12">
                  <hr className="my-2" />
                  <h6 className="mb-3">Location dropdowns</h6>
                  <div className="row g-3">
                    <div className="col-lg-6">
                      <label className="form-label" htmlFor="settings-location-types">
                        Location types
                      </label>
                      <p className="text-muted small mb-2">
                        Options shown when creating storage locations.
                      </p>
                      <ul className="list-group mb-2" id="settings-location-types">
                        {locationTypesFromSettings(settings).map((type) => (
                          <li
                            key={type}
                            className="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <span>{type.replace(/_/g, " ")}</span>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => removeLocationTypeOption(type)}
                              disabled={locationTypesFromSettings(settings).length <= 1}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="input-group">
                        <input
                          className="form-control"
                          placeholder="New location type"
                          value={newLocationType}
                          onChange={(e) => setNewLocationType(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addLocationTypeOption();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={addLocationTypeOption}
                          disabled={!newLocationType.trim()}
                        >
                          Add
                        </button>
                      </div>
                      <div className="mt-3">
                        <label className="form-label" htmlFor="settings-default-location-type">
                          Default location type
                        </label>
                        <select
                          id="settings-default-location-type"
                          className="form-select"
                          value={defaultLocationTypeFromSettings(settings)}
                          onChange={(e) =>
                            updateSettingsExtras({ defaultLocationType: e.target.value })
                          }
                        >
                          {locationTypesFromSettings(settings).map((type) => (
                            <option key={type} value={type}>
                              {type.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="mb-3">
                        <label className="form-label" htmlFor="settings-default-source-location">
                          Default source location
                        </label>
                        <p className="text-muted small mb-2">
                          Prefills the Transfer form source location.
                        </p>
                        <select
                          id="settings-default-source-location"
                          className="form-select"
                          value={String(settings.settings?.defaultSourceLocationId ?? "")}
                          onChange={(e) =>
                            updateSettingsExtras({
                              defaultSourceLocationId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">None</option>
                          {locationOptions()}
                        </select>
                      </div>
                      <div className="mb-3">
                        <label
                          className="form-label"
                          htmlFor="settings-default-destination-location"
                        >
                          Default destination location
                        </label>
                        <p className="text-muted small mb-2">
                          Prefills the Transfer form destination location.
                        </p>
                        <select
                          id="settings-default-destination-location"
                          className="form-select"
                          value={String(settings.settings?.defaultDestinationLocationId ?? "")}
                          onChange={(e) =>
                            updateSettingsExtras({
                              defaultDestinationLocationId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">None</option>
                          {locationOptions()}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        ) : null}
      </ModuleWorkspaceTabs>

      <ForgePrintDialog
        open={bridgePrintItem != null}
        onClose={() => setBridgePrintItem(null)}
        module="SAFETY_SUPPLIES"
        recordType="supply_item"
        recordId={bridgePrintItem?.id}
        defaultTitle="PRINT LABEL"
        fieldValues={
          bridgePrintItem
            ? {
                name: bridgePrintItem.name,
                itemNumber: bridgePrintItem.itemNumber,
                title: bridgePrintItem.name,
              }
            : {}
        }
      />
    </div>
  );
}
