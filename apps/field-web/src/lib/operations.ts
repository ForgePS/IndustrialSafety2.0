/**
 * Phase 8 operations helpers for Forge Safety - Field Version.
 * Location = site_id; Division = division_name (DB columns unchanged).
 */

export type OperationsHubId = "equipment" | "fleet" | "forklifts" | "dot" | "supplies" | "forms";

export type OperationsHubDef = {
  id: OperationsHubId;
  label: string;
  detail: string;
  href: string;
  moduleCode: string;
  featureId: string;
  permission?: "field.fleet.inspect";
};

export const OPERATIONS_HUBS: readonly OperationsHubDef[] = [
  {
    id: "equipment",
    label: "Equipment",
    detail: "Browse and open equipment profiles",
    href: "/more/equipment/",
    moduleCode: "EQUIPMENT",
    featureId: "more-equipment",
  },
  {
    id: "fleet",
    label: "Fleet",
    detail: "Vehicles and fleet inspections",
    href: "/fleet/",
    moduleCode: "FLEET",
    featureId: "fleet",
    permission: "field.fleet.inspect",
  },
  {
    id: "forklifts",
    label: "Forklifts",
    detail: "Forklift records and inspections",
    href: "/forklifts/",
    moduleCode: "FORKLIFTS",
    featureId: "forklifts",
    permission: "field.fleet.inspect",
  },
  {
    id: "dot",
    label: "DOT / DVIR",
    detail: "DOT-regulated assets and driver vehicle inspection reports",
    href: "/dot/",
    moduleCode: "DOT_COMPLIANCE",
    featureId: "more-dot",
    permission: "field.fleet.inspect",
  },
  {
    id: "supplies",
    label: "Safety Supplies",
    detail: "Issue PPE and request stock",
    href: "/more/safety-supplies/",
    moduleCode: "SAFETY_SUPPLIES",
    featureId: "more-safety-supplies",
  },
  {
    id: "forms",
    label: "Forms",
    detail: "Assigned and published field forms",
    href: "/forms/",
    moduleCode: "FORMS",
    featureId: "more-forms",
  },
];

export type EquipmentListItem = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  siteId?: string | null;
  equipmentNumber?: string | null;
  equipmentType?: string | null;
};

export type FleetVehicleItem = {
  id: string;
  assetNumber?: string | null;
  assetType?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  licensePlate?: string | null;
  locationName?: string | null;
  siteId?: string | null;
  status?: string | null;
  outOfService?: boolean;
  outOfServiceReason?: string | null;
  dotRegulated?: boolean;
  assignedDriverName?: string | null;
};

export type ForkliftRecord = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  siteId?: string | null;
  sourcePayload?: Record<string, unknown> | null;
};

export type SupplyItem = {
  id: string;
  name?: string;
  sku?: string | null;
  itemNumber?: string | null;
  status?: string | null;
  inventoryType?: string | null;
};

export type SupplyLocation = {
  id: string;
  name?: string;
  siteId?: string | null;
  status?: string | null;
};

export function equipmentDisplayName(row: EquipmentListItem): string {
  return String(row.name || row.title || row.equipmentNumber || "Equipment").trim();
}

export function fleetDisplayName(row: FleetVehicleItem): string {
  const unit = String(row.assetNumber ?? "").trim();
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ").trim();
  if (unit && ymm) return `${unit} · ${ymm}`;
  return unit || ymm || String(row.licensePlate ?? "").trim() || "Fleet asset";
}

export function forkliftDisplayName(row: ForkliftRecord): string {
  const payload = row.sourcePayload ?? {};
  const fromPayload = String(
    payload.equipmentNumber ?? payload.unitNumber ?? payload.name ?? "",
  ).trim();
  return String(row.title || row.name || fromPayload || "Forklift").trim();
}

export function matchesOrgSite(
  siteId: string | null | undefined,
  selectedLocationId: string,
): boolean {
  if (!selectedLocationId) return true;
  if (!siteId) return true;
  return siteId === selectedLocationId;
}

export function filterEquipmentByLocation(
  items: readonly EquipmentListItem[],
  locationId: string,
): EquipmentListItem[] {
  return items.filter((item) => matchesOrgSite(item.siteId, locationId));
}

export function filterFleetByLocation(
  items: readonly FleetVehicleItem[],
  locationId: string,
): FleetVehicleItem[] {
  return items.filter((item) => matchesOrgSite(item.siteId, locationId));
}

export function enabledOperationsHubs(
  moduleEnabled: (code: string) => boolean,
): OperationsHubDef[] {
  return OPERATIONS_HUBS.filter((hub) => moduleEnabled(hub.moduleCode));
}
