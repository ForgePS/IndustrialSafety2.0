import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialFleetAssignmentHistory,
  industrialFleetDocuments,
  industrialFleetDriverSettings,
  industrialFleetDrivers,
  industrialFleetEngineHoursHistory,
  industrialFleetMaintenance,
  industrialFleetMileageHistory,
  industrialFleetVehicles,
  industrialInspections,
  industrialPersonnel,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { normalizeVin, validateVin } from "@forge/validation";
import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { fleetVehicleStickerAssetLabel, qrCodePngBuffer } from "./qr-svg.js";
import { ensureCompanyDriverRosterEntry } from "./company-driver-roster.js";
import {
  compareFleetAssetsByLocation,
  compareFleetRenewalsByLocationThenSoonest,
  fleetRenewalBucket,
} from "./fleet-list-sort.js";

type ListQuery = Record<string, string | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMOVED_STATUSES = new Set(["REMOVED", "SOLD", "DISPOSED"]);

function assignmentHasDriver(assignment: {
  personnelId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
}): boolean {
  return Boolean(
    String(assignment.personnelId ?? "").trim() ||
      String(assignment.driverId ?? "").trim() ||
      String(assignment.driverName ?? "").trim(),
  );
}

/** Anyone assigned to a company vehicle belongs on the Company Drivers roster. */
async function ensureCompanyDriverFromAssignment(
  tx: DatabaseTransaction,
  tenantId: string,
  assignment: {
    personnelId?: string | null;
    driverId?: string | null;
    driverName?: string | null;
    siteId?: string | null;
  },
): Promise<string | null> {
  return ensureCompanyDriverRosterEntry(tx, tenantId, {
    ...assignment,
    seededFrom: "fleet_vehicle_assignment",
  });
}

function page(query: ListQuery) {
  const pageNum = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 25) || 25));
  return { page: pageNum, pageSize, offset: (pageNum - 1) * pageSize };
}

function splitDriverPersonName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "Driver" };
  if (parts.length === 1) {
    const only = parts[0] ?? "Driver";
    return { firstName: only, lastName: only };
  }
  const firstName = parts[0] ?? "Unknown";
  return { firstName, lastName: parts.slice(1).join(" ") || firstName };
}

function assertId(id: string): string {
  const value = String(id ?? "").trim();
  if (!UUID_PATTERN.test(value)) throw new ForgeError("VALIDATION_FAILED", "Invalid id.");
  return value;
}

function asDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asBool(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "1" || value === "X" || value === "x")
    return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

function monthFromRenewal(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && raw >= 1 && raw <= 12) return Math.trunc(raw);
  const s = String(raw).trim().toLowerCase();
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const idx = months.findIndex((m) => m.startsWith(s.slice(0, 3)));
  return idx >= 0 ? idx + 1 : null;
}

function unwrapPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

const VEHICLE_INSURANCE_PAYLOAD_KEYS = [
  "insuranceCompany",
  "insurancePolicyNumber",
  "insurancePhone",
  "insuranceAgentName",
  "insuranceAgentPhone",
  "insuranceAgentEmail",
  "insuranceEffectiveDate",
  "insuranceExpirationDate",
] as const;

function insuranceFieldsFromPayload(raw: unknown): Record<string, string | null> {
  const payload = unwrapPayload(raw);
  const out: Record<string, string | null> = {};
  for (const key of VEHICLE_INSURANCE_PAYLOAD_KEYS) {
    const value = payload[key];
    out[key] = value == null || value === "" ? null : String(value).trim() || null;
  }
  return out;
}

function insuranceFieldsFromBody(body: Record<string, unknown>): Record<string, string | null> | null {
  let touched = false;
  const out: Record<string, string | null> = {};
  for (const key of VEHICLE_INSURANCE_PAYLOAD_KEYS) {
    if (body[key] === undefined) continue;
    touched = true;
    out[key] = body[key] == null || body[key] === "" ? null : String(body[key]).trim() || null;
  }
  return touched ? out : null;
}

function mapVehicle(row: typeof industrialFleetVehicles.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    assetNumber: row.assetNumber,
    assetType: row.assetType,
    customAssetTypeLabel: row.customAssetTypeLabel,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    color: row.color,
    vin: row.vin,
    serialNumber: row.serialNumber,
    licensePlate: row.licensePlate,
    licenseState: row.licenseState,
    renewalDate: row.renewalDate,
    registrationRenewalMonth: row.registrationRenewalMonth,
    locationName: row.locationName,
    assignedDriverId: row.assignedDriverId,
    assignedDriverPersonnelId: row.assignedDriverPersonnelId,
    assignedDriverName: row.assignedDriverName,
    countyAssessed: row.countyAssessed,
    countyAssessmentStatus: row.countyAssessmentStatus,
    countyAssessmentNotes: row.countyAssessmentNotes,
    insured: row.insured,
    insuranceStatus: row.insuranceStatus,
    ...insuranceFieldsFromPayload(row.sourcePayload),
    mileage: row.mileage,
    mileageUpdatedAt: row.mileageUpdatedAt?.toISOString() ?? null,
    engineHours: row.engineHours,
    engineHoursUpdatedAt: row.engineHoursUpdatedAt?.toISOString() ?? null,
    notes: row.notes,
    vehicleFringe: row.vehicleFringe,
    notOnVehicleFringeSs: row.notOnVehicleFringeSs,
    commuteUseStatus: row.commuteUseStatus,
    commuteUseNotes: row.commuteUseNotes,
    form2290Status: row.form2290Status,
    form2290Notes: row.form2290Notes,
    irpStatus: row.irpStatus,
    irpNotes: row.irpNotes,
    dispositionStatus: row.dispositionStatus,
    dispositionDate: row.dispositionDate,
    dispositionNotes: row.dispositionNotes,
    outOfService: Boolean(row.outOfService),
    outOfServiceReason: row.outOfServiceReason,
    dotRegulated: Boolean(row.dotRegulated),
    hasDvirQr: Boolean(row.dvirPublicTokenHash),
    dvirQrIssuedAt: row.dvirPublicTokenIssuedAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDriver(row: typeof industrialFleetDrivers.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    personnelId: row.personnelId,
    personnelName: row.personnelName,
    employeeNumber: row.employeeNumber,
    licenseNumber: row.licenseNumber,
    licenseState: row.licenseState,
    licenseExpiryDate: row.licenseExpiryDate,
    dateOfBirth: row.dateOfBirth,
    status: row.status,
    initialMvrDate: row.initialMvrDate,
    lastMvrDate: row.lastMvrDate,
    nextMvrDueDate: row.nextMvrDueDate,
    insuranceEffectiveDate: row.insuranceEffectiveDate,
    insuranceRemovedDate: row.insuranceRemovedDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function vehiclePatchFromBody(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const str = (k: string, col?: string) => {
    if (body[k] !== undefined) patch[col ?? k] = body[k] == null ? null : String(body[k]).trim() || null;
  };
  const num = (k: string, col?: string) => {
    if (body[k] !== undefined) patch[col ?? k] = asInt(body[k]);
  };
  const bool = (k: string, col?: string) => {
    if (body[k] !== undefined) patch[col ?? k] = asBool(body[k]);
  };
  str("siteId");
  str("assetNumber");
  str("assetType");
  str("customAssetTypeLabel");
  num("year");
  str("make");
  str("model");
  str("trim");
  str("color");
  if (body.vin !== undefined) {
    const raw = body.vin == null ? "" : String(body.vin);
    if (!raw.trim()) patch.vin = null;
    else {
      const v = validateVin(raw);
      patch.vin = v.normalized;
    }
  }
  str("serialNumber");
  str("licensePlate");
  str("licenseState");
  if (body.renewalDate !== undefined) patch.renewalDate = asDate(body.renewalDate);
  if (body.registrationRenewalMonth !== undefined) {
    patch.registrationRenewalMonth =
      asInt(body.registrationRenewalMonth) ?? monthFromRenewal(body.registrationRenewalMonth);
  } else if (body.renewalMonth !== undefined) {
    patch.registrationRenewalMonth =
      asInt(body.renewalMonth) ?? monthFromRenewal(body.renewalMonth);
  }
  str("locationName");
  if (body.assignedDriverId !== undefined) {
    patch.assignedDriverId = body.assignedDriverId ? String(body.assignedDriverId) : null;
  }
  if (body.assignedDriverPersonnelId !== undefined) {
    patch.assignedDriverPersonnelId = body.assignedDriverPersonnelId
      ? String(body.assignedDriverPersonnelId)
      : null;
  }
  str("assignedDriverName");
  str("countyAssessed");
  str("countyAssessmentStatus");
  str("countyAssessmentNotes");
  bool("insured");
  str("insuranceStatus");
  num("mileage");
  num("engineHours");
  str("notes");
  bool("vehicleFringe");
  bool("notOnVehicleFringeSs");
  str("commuteUseStatus");
  str("commuteUseNotes");
  str("form2290Status");
  str("form2290Notes");
  str("irpStatus");
  str("irpNotes");
  str("dispositionStatus");
  if (body.dispositionDate !== undefined) patch.dispositionDate = asDate(body.dispositionDate);
  str("dispositionNotes");
  bool("outOfService");
  str("outOfServiceReason");
  bool("dotRegulated");
  str("status");
  return patch;
}

@Injectable()
export class IndustrialFleetService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listVehicles(principal: ForgePrincipal, query: ListQuery) {
    const { page: pageNum, pageSize, offset } = page(query);
    const q = (query.q ?? "").trim();
    const assetType = (query.assetType ?? "").trim();
    const status = (query.status ?? "").trim();
    const siteId = (query.siteId ?? query.locationId ?? "").trim();
    const location = (query.location ?? query.locationName ?? "").trim();
    const insured = (query.insured ?? "").trim().toLowerCase();
    const removedOnly = query.removed === "1" || query.removed === "true";
    const overdueReg = query.overdueRegistration === "1" || query.overdueRegistration === "true";
    const dotOnly = query.dotRegulated === "1" || query.dotRegulated === "true";

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialFleetVehicles.tenantId, principal.tenantId),
        isNull(industrialFleetVehicles.archivedAt),
      ];
      if (assetType) conditions.push(eq(industrialFleetVehicles.assetType, assetType));
      if (status) conditions.push(eq(industrialFleetVehicles.status, status));
      if (siteId) conditions.push(eq(industrialFleetVehicles.siteId, siteId));
      if (location) {
        conditions.push(ilike(industrialFleetVehicles.locationName, `%${location}%`));
      }
      if (insured === "true" || insured === "1") {
        conditions.push(eq(industrialFleetVehicles.insured, true));
      } else if (insured === "false" || insured === "0") {
        conditions.push(
          or(
            eq(industrialFleetVehicles.insured, false),
            isNull(industrialFleetVehicles.insured),
          )!,
        );
      }
      if (q) {
        conditions.push(
          or(
            ilike(industrialFleetVehicles.make, `%${q}%`),
            ilike(industrialFleetVehicles.model, `%${q}%`),
            ilike(industrialFleetVehicles.vin, `%${q}%`),
            ilike(industrialFleetVehicles.licensePlate, `%${q}%`),
            ilike(industrialFleetVehicles.assetNumber, `%${q}%`),
            ilike(industrialFleetVehicles.assignedDriverName, `%${q}%`),
            ilike(industrialFleetVehicles.locationName, `%${q}%`),
          )!,
        );
      }

      const rows = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(and(...conditions))
        .orderBy(
          sql`${industrialFleetVehicles.locationName} ASC NULLS LAST`,
          asc(industrialFleetVehicles.assetNumber),
          desc(industrialFleetVehicles.updatedAt),
        );

      let mapped = rows.map(mapVehicle);
      if (removedOnly) {
        mapped = mapped.filter((r) => REMOVED_STATUSES.has(String(r.status).toUpperCase()));
      } else if (!status) {
        mapped = mapped.filter((r) => !REMOVED_STATUSES.has(String(r.status).toUpperCase()));
      }
      if (dotOnly) {
        mapped = mapped.filter((r) => Boolean(r.dotRegulated));
      }
      if (overdueReg) {
        mapped = mapped.filter((r) => fleetRenewalBucket(r) === "OVERDUE");
      }
      mapped.sort(compareFleetAssetsByLocation);

      return {
        page: pageNum,
        pageSize,
        total: mapped.length,
        items: mapped.slice(offset, offset + pageSize),
      };
    });
  }

  async getVehicle(principal: ForgePrincipal, id: string) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");
      return mapVehicle(row);
    });
  }

  async createVehicle(principal: ForgePrincipal, body: Record<string, unknown>) {
    const patch = vehiclePatchFromBody(body);
    if (body.vin && typeof body.vin === "string" && body.vin.trim()) {
      const vin = validateVin(String(body.vin));
      if (!vin.ok && vin.reason === "check_digit") {
        // Soft warn: still store normalized VIN (many fleet sheets have typos)
        patch.vin = vin.normalized;
      } else if (vin.ok) {
        patch.vin = vin.normalized;
      } else if (vin.reason !== "empty") {
        patch.vin = vin.normalized || normalizeVin(String(body.vin));
      }
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialFleetVehicles)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          assetType: String(patch.assetType ?? "FLEET_VEHICLE"),
          status: String(patch.status ?? "ACTIVE"),
          outOfService: Boolean(patch.outOfService ?? false),
          dotRegulated: Boolean(patch.dotRegulated ?? false),
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
          ...patch,
        } as typeof industrialFleetVehicles.$inferInsert)
        .returning();
      if (
        assignmentHasDriver({
          personnelId: row!.assignedDriverPersonnelId,
          driverId: row!.assignedDriverId,
          driverName: row!.assignedDriverName,
        })
      ) {
        const ensuredId = await ensureCompanyDriverFromAssignment(tx, principal.tenantId, {
          personnelId: row!.assignedDriverPersonnelId,
          driverId: row!.assignedDriverId,
          driverName: row!.assignedDriverName,
          siteId: row!.siteId,
        });
        if (ensuredId && !row!.assignedDriverId) {
          const [linked] = await tx
            .update(industrialFleetVehicles)
            .set({ assignedDriverId: ensuredId, updatedAt: now })
            .where(eq(industrialFleetVehicles.id, row!.id))
            .returning();
          return mapVehicle(linked ?? row!);
        }
      }
      return mapVehicle(row!);
    });
  }

  async patchVehicle(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = assertId(id);
    const patch = vehiclePatchFromBody(body);
    const insurancePatch = insuranceFieldsFromBody(body);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Fleet asset not found");

      const nextPayload = insurancePatch
        ? { ...unwrapPayload(existing.sourcePayload), ...insurancePatch }
        : undefined;

      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({
          ...patch,
          ...(nextPayload ? { sourcePayload: nextPayload } : {}),
          updatedAt: now,
        } as Partial<typeof industrialFleetVehicles.$inferInsert>)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");
      if (
        assignmentHasDriver({
          personnelId: row.assignedDriverPersonnelId,
          driverId: row.assignedDriverId,
          driverName: row.assignedDriverName,
        })
      ) {
        const ensuredId = await ensureCompanyDriverFromAssignment(tx, principal.tenantId, {
          personnelId: row.assignedDriverPersonnelId,
          driverId: row.assignedDriverId,
          driverName: row.assignedDriverName,
          siteId: row.siteId,
        });
        if (ensuredId && !row.assignedDriverId) {
          const [linked] = await tx
            .update(industrialFleetVehicles)
            .set({ assignedDriverId: ensuredId, updatedAt: now })
            .where(eq(industrialFleetVehicles.id, recordId))
            .returning();
          return mapVehicle(linked ?? row);
        }
      }
      return mapVehicle(row);
    });
  }

  async disposeVehicle(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const status = String(body.status ?? body.dispositionStatus ?? "REMOVED").toUpperCase();
    return this.patchVehicle(principal, id, {
      status,
      dispositionStatus: status,
      dispositionDate: body.dispositionDate ?? new Date().toISOString().slice(0, 10),
      dispositionNotes: body.dispositionNotes ?? body.notes ?? null,
      assignedDriverId: null,
      assignedDriverPersonnelId: null,
      assignedDriverName: null,
    });
  }

  async archiveVehicle(principal: ForgePrincipal, id: string) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");
      return mapVehicle(row);
    });
  }

  async assignDriver(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = assertId(id);
    const personnelId = body.personnelId ? String(body.personnelId) : null;
    const driverId = body.driverId ? String(body.driverId) : null;
    let driverName =
      body.driverName != null ? String(body.driverName).trim() || null : null;

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      if (personnelId && !driverName) {
        const [p] = await tx
          .select()
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (p) {
          driverName =
            [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
            p.displayName ||
            null;
        }
      }
      if (driverId && !driverName) {
        const [d] = await tx
          .select()
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.id, driverId),
              eq(industrialFleetDrivers.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (d) driverName = d.personnelName;
      }

      const now = new Date();
      const assigning = assignmentHasDriver({ personnelId, driverId, driverName });
      const ensuredId = assigning
        ? await ensureCompanyDriverFromAssignment(tx, principal.tenantId, {
            personnelId,
            driverId,
            driverName,
            siteId: body.siteId ? String(body.siteId) : null,
          })
        : null;
      const resolvedDriverId = driverId || ensuredId;

      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({
          assignedDriverPersonnelId: personnelId,
          assignedDriverId: assigning ? resolvedDriverId : null,
          assignedDriverName: driverName,
          siteId: body.siteId ? String(body.siteId) : undefined,
          locationName:
            body.locationName !== undefined
              ? body.locationName
                ? String(body.locationName)
                : null
              : undefined,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");

      await tx.insert(industrialFleetAssignmentHistory).values({
        id: createId(),
        tenantId: principal.tenantId,
        vehicleId: recordId,
        personnelId,
        driverId: assigning ? resolvedDriverId : null,
        driverName,
        action: assigning ? "ASSIGN" : "UNASSIGN",
        effectiveAt: now,
        notes: body.notes ? String(body.notes) : null,
        createdAt: now,
      });

      return mapVehicle(row);
    });
  }

  async updateMileage(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = assertId(id);
    const mileage = asInt(body.mileage);
    if (mileage == null || mileage < 0) {
      throw new ForgeError("VALIDATION_FAILED", "mileage is required");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({ mileage, mileageUpdatedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");
      await tx.insert(industrialFleetMileageHistory).values({
        id: createId(),
        tenantId: principal.tenantId,
        vehicleId: recordId,
        mileage,
        recordedAt: now,
        notes: body.notes ? String(body.notes) : null,
        createdAt: now,
      });
      return mapVehicle(row);
    });
  }

  async updateEngineHours(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = assertId(id);
    const engineHours = asInt(body.engineHours);
    if (engineHours == null || engineHours < 0) {
      throw new ForgeError("VALIDATION_FAILED", "engineHours is required");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({ engineHours, engineHoursUpdatedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet asset not found");
      await tx.insert(industrialFleetEngineHoursHistory).values({
        id: createId(),
        tenantId: principal.tenantId,
        vehicleId: recordId,
        engineHours,
        recordedAt: now,
        notes: body.notes ? String(body.notes) : null,
        createdAt: now,
      });
      return mapVehicle(row);
    });
  }

  async vehicleHistory(principal: ForgePrincipal, id: string) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [assignments, mileage, engineHours] = await Promise.all([
        tx
          .select()
          .from(industrialFleetAssignmentHistory)
          .where(
            and(
              eq(industrialFleetAssignmentHistory.tenantId, principal.tenantId),
              eq(industrialFleetAssignmentHistory.vehicleId, recordId),
            ),
          )
          .orderBy(desc(industrialFleetAssignmentHistory.effectiveAt)),
        tx
          .select()
          .from(industrialFleetMileageHistory)
          .where(
            and(
              eq(industrialFleetMileageHistory.tenantId, principal.tenantId),
              eq(industrialFleetMileageHistory.vehicleId, recordId),
            ),
          )
          .orderBy(desc(industrialFleetMileageHistory.recordedAt)),
        tx
          .select()
          .from(industrialFleetEngineHoursHistory)
          .where(
            and(
              eq(industrialFleetEngineHoursHistory.tenantId, principal.tenantId),
              eq(industrialFleetEngineHoursHistory.vehicleId, recordId),
            ),
          )
          .orderBy(desc(industrialFleetEngineHoursHistory.recordedAt)),
      ]);
      return {
        assignments: assignments.map((r) => ({
          id: r.id,
          personnelId: r.personnelId,
          driverId: r.driverId,
          driverName: r.driverName,
          action: r.action,
          effectiveAt: r.effectiveAt.toISOString(),
          notes: r.notes,
        })),
        mileage: mileage.map((r) => ({
          id: r.id,
          mileage: r.mileage,
          recordedAt: r.recordedAt.toISOString(),
          notes: r.notes,
        })),
        engineHours: engineHours.map((r) => ({
          id: r.id,
          engineHours: r.engineHours,
          recordedAt: r.recordedAt.toISOString(),
          notes: r.notes,
        })),
      };
    });
  }

  async dashboard(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        );
      const mapped = rows.map(mapVehicle);
      const active = mapped.filter((r) => !REMOVED_STATUSES.has(String(r.status).toUpperCase()));
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const renewals: Record<string, number> = {
        OVERDUE: 0,
        DUE_30: 0,
        DUE_60: 0,
        DUE_90: 0,
        LATER: 0,
        UNKNOWN: 0,
      };
      for (const r of active) {
        byType[r.assetType] = (byType[r.assetType] ?? 0) + 1;
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        const bucket = fleetRenewalBucket(r);
        renewals[bucket] = (renewals[bucket] ?? 0) + 1;
      }
      return {
        totalActive: active.length,
        totalRemoved: mapped.length - active.length,
        outOfService: active.filter((r) => r.outOfService).length,
        insured: active.filter((r) => r.insured === true).length,
        byType,
        byStatus,
        renewals,
      };
    });
  }

  async renewals(principal: ForgePrincipal, query: ListQuery) {
    const bucketFilter = (query.bucket ?? "").trim().toUpperCase();
    const list = await this.listVehicles(principal, { ...query, page: "1", pageSize: "500" });
    const items = list.items.map((r) => ({ ...r, renewalBucket: fleetRenewalBucket(r) }));
    const filtered = bucketFilter
      ? items.filter((r) => r.renewalBucket === bucketFilter)
      : items;
    filtered.sort(compareFleetRenewalsByLocationThenSoonest);
    const buckets: Record<string, number> = {
      OVERDUE: 0,
      DUE_30: 0,
      DUE_60: 0,
      DUE_90: 0,
      LATER: 0,
      UNKNOWN: 0,
    };
    for (const r of items) buckets[r.renewalBucket] = (buckets[r.renewalBucket] ?? 0) + 1;
    return { buckets, items: filtered, notificationHint: "Configure recipients in Fleet Settings." };
  }

  async setOutOfService(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const oos = asBool(body.outOfService) ?? true;
    return this.patchVehicle(principal, id, {
      outOfService: oos,
      outOfServiceReason: body.reason ?? body.outOfServiceReason ?? null,
      status: oos ? "OUT_OF_SERVICE" : "ACTIVE",
    });
  }

  async listMaintenance(principal: ForgePrincipal, query: ListQuery) {
    const { page: pageNum, pageSize, offset } = page(query);
    const vehicleId = (query.vehicleId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialFleetMaintenance.tenantId, principal.tenantId),
        isNull(industrialFleetMaintenance.archivedAt),
      ];
      if (vehicleId) conditions.push(eq(industrialFleetMaintenance.vehicleId, vehicleId));
      const rows = await tx
        .select()
        .from(industrialFleetMaintenance)
        .where(and(...conditions))
        .orderBy(desc(industrialFleetMaintenance.updatedAt));
      return {
        page: pageNum,
        pageSize,
        total: rows.length,
        items: rows.slice(offset, offset + pageSize).map((r) => ({
          id: r.id,
          vehicleId: r.vehicleId,
          title: r.title,
          maintenanceType: r.maintenanceType,
          status: r.status,
          dueDate: r.dueDate,
          completedAt: r.completedAt?.toISOString() ?? null,
          costCents: r.costCents,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      };
    });
  }

  async createMaintenance(principal: ForgePrincipal, body: Record<string, unknown>) {
    const vehicleId = assertId(String(body.vehicleId ?? ""));
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const status = String(body.status ?? "OPEN").toUpperCase();
      const completedAt =
        status === "COMPLETED"
          ? body.completedAt
            ? new Date(String(body.completedAt))
            : now
          : null;
      const [row] = await tx
        .insert(industrialFleetMaintenance)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          vehicleId,
          title,
          maintenanceType: String(body.maintenanceType ?? "REPAIR"),
          status,
          dueDate: asDate(body.dueDate),
          completedAt:
            completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt : null,
          costCents: asInt(body.costCents),
          notes: body.notes ? String(body.notes) : null,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        id: row!.id,
        vehicleId: row!.vehicleId,
        title: row!.title,
        maintenanceType: row!.maintenanceType,
        status: row!.status,
        dueDate: row!.dueDate,
        completedAt: row!.completedAt?.toISOString() ?? null,
        costCents: row!.costCents,
        notes: row!.notes,
        createdAt: row!.createdAt.toISOString(),
        updatedAt: row!.updatedAt.toISOString(),
      };
    });
  }

  async completeMaintenance(principal: ForgePrincipal, id: string) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialFleetMaintenance)
        .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialFleetMaintenance.id, recordId),
            eq(industrialFleetMaintenance.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Maintenance record not found");
      return { id: row.id, status: row.status, completedAt: row.completedAt?.toISOString() };
    });
  }

  async listFleetInspections(principal: ForgePrincipal, query: ListQuery) {
    const { page: pageNum, pageSize, offset } = page(query);
    const vehicleId = (query.vehicleId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.tenantId, principal.tenantId),
            isNull(industrialInspections.archivedAt),
            sql`${industrialInspections.sourcePayload}->>'parentEntityType' = 'FLEET_ASSET'`,
          ),
        )
        .orderBy(desc(industrialInspections.updatedAt));
      let items = rows.map((r) => {
        const payload =
          typeof r.sourcePayload === "object" && r.sourcePayload
            ? (r.sourcePayload as Record<string, unknown>)
            : {};
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          vehicleId: payload.parentEntityId ?? payload.vehicleId ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      });
      if (vehicleId) {
        items = items.filter((i) => String(i.vehicleId ?? "") === vehicleId);
      }
      return {
        page: pageNum,
        pageSize,
        total: items.length,
        items: items.slice(offset, offset + pageSize),
      };
    });
  }

  async createFleetInspection(principal: ForgePrincipal, body: Record<string, unknown>) {
    const vehicleId = assertId(String(body.vehicleId ?? body.parentEntityId ?? ""));
    const title = String(body.title ?? "Fleet inspection").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialInspections)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          title,
          status: String(body.status ?? "OPEN"),
          sourceSystem: "FORGE",
          sourcePayload: {
            ...body,
            parentEntityType: "FLEET_ASSET",
            parentEntityId: vehicleId,
            vehicleId,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (body.defect || body.outOfService === true || body.outOfService === "true") {
        await tx
          .update(industrialFleetVehicles)
          .set({
            outOfService: true,
            outOfServiceReason: String(body.defect ?? body.outOfServiceReason ?? "Inspection defect"),
            status: "OUT_OF_SERVICE",
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialFleetVehicles.id, vehicleId),
              eq(industrialFleetVehicles.tenantId, principal.tenantId),
            ),
          );
      }
      return {
        id: row!.id,
        title: row!.title,
        status: row!.status,
        vehicleId,
        createdAt: row!.createdAt.toISOString(),
        updatedAt: row!.updatedAt.toISOString(),
      };
    });
  }

  async listDocuments(principal: ForgePrincipal, query: ListQuery) {
    const { page: pageNum, pageSize, offset } = page(query);
    const vehicleId = (query.vehicleId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialFleetDocuments.tenantId, principal.tenantId),
        isNull(industrialFleetDocuments.archivedAt),
      ];
      if (vehicleId) conditions.push(eq(industrialFleetDocuments.vehicleId, vehicleId));
      const rows = await tx
        .select()
        .from(industrialFleetDocuments)
        .where(and(...conditions))
        .orderBy(desc(industrialFleetDocuments.updatedAt));
      return {
        page: pageNum,
        pageSize,
        total: rows.length,
        items: rows
          .slice(offset, offset + pageSize)
          .map((r) => this.mapFleetDocument(r, { includeDataUrl: false })),
      };
    });
  }

  async getDocument(principal: ForgePrincipal, id: string) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFleetDocuments)
        .where(
          and(
            eq(industrialFleetDocuments.id, recordId),
            eq(industrialFleetDocuments.tenantId, principal.tenantId),
            isNull(industrialFleetDocuments.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Document not found.");
      return this.mapFleetDocument(row, { includeDataUrl: true });
    });
  }

  async createDocument(principal: ForgePrincipal, body: Record<string, unknown>) {
    const vehicleId = assertId(String(body.vehicleId ?? ""));
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
    if (dataUrl) {
      if (!dataUrl.startsWith("data:")) {
        throw new ForgeError("VALIDATION_FAILED", "Photo upload must be a data URL.");
      }
      if (dataUrl.length > 3_500_000) {
        throw new ForgeError("VALIDATION_FAILED", "Photo is too large; compress and retry.");
      }
      if (!dataUrl.startsWith("data:image/") && !dataUrl.startsWith("data:application/pdf")) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Only image or PDF uploads are supported for fleet documents.",
        );
      }
    }
    const fileName = String(body.fileName ?? body.originalFilename ?? "document.jpg")
      .trim()
      .slice(0, 255);
    const contentTypeFromData = (() => {
      const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
      return match?.[1] ?? null;
    })();
    const contentType =
      String(body.contentType ?? "").trim() || contentTypeFromData || null;

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [vehicle] = await tx
        .select({ id: industrialFleetVehicles.id })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, vehicleId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) {
        throw new ForgeError("NOT_FOUND", "Vehicle not found for this document.");
      }

      const now = new Date();
      const id = createId();
      const [row] = await tx
        .insert(industrialFleetDocuments)
        .values({
          id,
          tenantId: principal.tenantId,
          vehicleId,
          title,
          documentType: String(body.documentType ?? "OTHER"),
          storageKey: dataUrl ? `inline:${id}` : body.storageKey ? String(body.storageKey) : null,
          contentType: contentType ? contentType.slice(0, 120) : null,
          notes: body.notes ? String(body.notes) : null,
          sourceSystem: "FORGE",
          sourcePayload: {
            fileName: fileName || null,
            contentType,
            ...(dataUrl ? { dataUrl } : {}),
            documentType: String(body.documentType ?? "OTHER"),
            notes: body.notes ? String(body.notes) : null,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapFleetDocument(row!, { includeDataUrl: true });
    });
  }

  private mapFleetDocument(
    r: {
      id: string;
      vehicleId: string;
      title: string;
      documentType: string;
      storageKey: string | null;
      contentType: string | null;
      notes: string | null;
      sourcePayload: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    options?: { includeDataUrl?: boolean },
  ) {
    const includeDataUrl = options?.includeDataUrl !== false;
    const payload =
      r.sourcePayload && typeof r.sourcePayload === "object" && !Array.isArray(r.sourcePayload)
        ? (r.sourcePayload as Record<string, unknown>)
        : {};
    const inlineDataUrl =
      typeof payload.dataUrl === "string" && payload.dataUrl.startsWith("data:")
        ? payload.dataUrl
        : null;
    const fileName =
      typeof payload.fileName === "string" && payload.fileName.trim()
        ? payload.fileName.trim()
        : null;
    return {
      id: r.id,
      vehicleId: r.vehicleId,
      title: r.title,
      documentType: r.documentType,
      storageKey: r.storageKey,
      contentType: r.contentType,
      notes: r.notes,
      fileName,
      dataUrl: includeDataUrl ? inlineDataUrl : null,
      hasPhoto: Boolean(inlineDataUrl),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async listDriversEditable(principal: ForgePrincipal, query: ListQuery) {
    const { page: pageNum, pageSize, offset } = page(query);
    const q = (query.q ?? "").trim().toLowerCase();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .orderBy(desc(industrialFleetDrivers.updatedAt));
      let items = rows.map(mapDriver);
      if (q) {
        items = items.filter((d) =>
          `${d.personnelName} ${d.employeeNumber} ${d.licenseNumber}`.toLowerCase().includes(q),
        );
      }
      return {
        page: pageNum,
        pageSize,
        total: items.length,
        items: items.slice(offset, offset + pageSize),
      };
    });
  }

  async createDriver(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialFleetDrivers)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          siteId: body.siteId ? String(body.siteId) : null,
          personnelId: body.personnelId ? String(body.personnelId) : null,
          personnelName: body.personnelName ? String(body.personnelName) : null,
          employeeNumber: body.employeeNumber ? String(body.employeeNumber) : null,
          licenseNumber: body.licenseNumber ? String(body.licenseNumber) : null,
          licenseState: body.licenseState ? String(body.licenseState) : null,
          licenseExpiryDate: asDate(body.licenseExpiryDate),
          dateOfBirth: asDate(body.dateOfBirth),
          status: String(body.status ?? "ACTIVE"),
          initialMvrDate: asDate(body.initialMvrDate),
          lastMvrDate: asDate(body.lastMvrDate),
          nextMvrDueDate: asDate(body.nextMvrDueDate),
          insuranceEffectiveDate: asDate(body.insuranceEffectiveDate),
          insuranceRemovedDate: asDate(body.insuranceRemovedDate),
          notes: body.notes ? String(body.notes) : null,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (row?.personnelId) {
        await tx
          .update(industrialPersonnel)
          .set({ isCompanyDriver: true, updatedAt: now })
          .where(
            and(
              eq(industrialPersonnel.id, row.personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          );
      }
      return mapDriver(row!);
    });
  }

  async patchDriver(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = assertId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const patch: Record<string, unknown> = { updatedAt: now };
      for (const key of [
        "siteId",
        "personnelId",
        "personnelName",
        "employeeNumber",
        "licenseNumber",
        "licenseState",
        "status",
        "notes",
      ] as const) {
        if (body[key] !== undefined) {
          patch[key] = body[key] == null ? null : String(body[key]);
        }
      }
      for (const key of [
        "licenseExpiryDate",
        "dateOfBirth",
        "initialMvrDate",
        "lastMvrDate",
        "nextMvrDueDate",
        "insuranceEffectiveDate",
        "insuranceRemovedDate",
      ] as const) {
        if (body[key] !== undefined) patch[key] = asDate(body[key]);
      }
      const [row] = await tx
        .update(industrialFleetDrivers)
        .set(patch as Partial<typeof industrialFleetDrivers.$inferInsert>)
        .where(
          and(
            eq(industrialFleetDrivers.id, recordId),
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet driver not found");
      if (body.personnelId !== undefined && body.personnelId != null) {
        const linkedId = String(body.personnelId).trim();
        if (linkedId) {
          await tx
            .update(industrialPersonnel)
            .set({ isCompanyDriver: true, updatedAt: now })
            .where(
              and(
                eq(industrialPersonnel.id, linkedId),
                eq(industrialPersonnel.tenantId, principal.tenantId),
              ),
            );
        }
      }
      return mapDriver(row);
    });
  }

  /**
   * Link a company driver roster row to an existing personnel file, or create a
   * new personnel file from the driver record so MVR / license data lives on
   * one person file.
   */
  async mergeDriverToPersonnel(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const recordId = assertId(id);
    const createPersonnel = body.createPersonnel === true;
    const forceMerge = body.forceMerge === true || body.force === true;
    const personnelIdInput =
      body.personnelId != null ? String(body.personnelId).trim() : "";

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [driver] = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.id, recordId),
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .limit(1);
      if (!driver) throw new ForgeError("NOT_FOUND", "Fleet driver not found");

      if (driver.personnelId && !createPersonnel && !personnelIdInput) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "This driver is already linked to a personnel file.",
        );
      }

      let personnelId: string | null = personnelIdInput || null;
      let personnelDisplayName: string | null = null;
      let personnelEmployeeNumber: string | null = null;
      let unlinkedDriverId: string | null = null;
      let unlinkedDriverName: string | null = null;

      if (createPersonnel) {
        if (driver.personnelId) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Unlink the current personnel file before creating a new one.",
          );
        }
        const rawName = String(driver.personnelName ?? "").trim();
        const { firstName, lastName } = splitDriverPersonName(rawName);
        const displayName = rawName || `${firstName} ${lastName}`.trim();
        const [person] = await tx
          .insert(industrialPersonnel)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            firstName,
            lastName,
            displayName,
            employeeNumber: driver.employeeNumber,
            isCompanyDriver: true,
            status: "Active",
            sourceSystem: "FORGE",
            sourcePayload: {
              mergedFromFleetDriverId: driver.id,
              licenseNumber: driver.licenseNumber,
              licenseState: driver.licenseState,
              licenseExpiryDate: driver.licenseExpiryDate,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        personnelId = person!.id;
        personnelDisplayName = person!.displayName;
        personnelEmployeeNumber = person!.employeeNumber;
      } else if (personnelId) {
        const [person] = await tx
          .select()
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
              isNull(industrialPersonnel.archivedAt),
            ),
          )
          .limit(1);
        if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

        const [conflict] = await tx
          .select({
            id: industrialFleetDrivers.id,
            personnelName: industrialFleetDrivers.personnelName,
          })
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.tenantId, principal.tenantId),
              eq(industrialFleetDrivers.personnelId, personnelId),
              isNull(industrialFleetDrivers.archivedAt),
              ne(industrialFleetDrivers.id, recordId),
            ),
          )
          .limit(1);
        if (conflict) {
          if (!forceMerge) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              `${person.displayName ?? "This person"} is already linked to another company driver. Use force merge to replace that link.`,
            );
          }
          await tx
            .update(industrialFleetDrivers)
            .set({ personnelId: null, updatedAt: now })
            .where(eq(industrialFleetDrivers.id, conflict.id));
          unlinkedDriverId = conflict.id;
          unlinkedDriverName = conflict.personnelName;
        }

        await tx
          .update(industrialPersonnel)
          .set({ isCompanyDriver: true, updatedAt: now })
          .where(eq(industrialPersonnel.id, personnelId));

        personnelDisplayName = person.displayName;
        personnelEmployeeNumber = person.employeeNumber;
      } else {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Choose a personnel file to link, or create a new personnel file.",
        );
      }

      const driverPatch: Partial<typeof industrialFleetDrivers.$inferInsert> = {
        personnelId,
        updatedAt: now,
      };
      if (personnelDisplayName) driverPatch.personnelName = personnelDisplayName;
      const driverEmp = String(driver.employeeNumber ?? "").trim();
      const personEmp = String(personnelEmployeeNumber ?? "").trim();
      if (!driverEmp && personEmp) driverPatch.employeeNumber = personEmp;

      const [row] = await tx
        .update(industrialFleetDrivers)
        .set(driverPatch)
        .where(
          and(
            eq(industrialFleetDrivers.id, recordId),
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Fleet driver not found");

      return {
        driver: mapDriver(row),
        personnelId,
        personnelDisplayName,
        unlinkedDriverId,
        unlinkedDriverName,
        forceMerge: forceMerge && Boolean(unlinkedDriverId),
      };
    });
  }

  async getSettings(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFleetDriverSettings)
        .where(eq(industrialFleetDriverSettings.tenantId, principal.tenantId))
        .limit(1);
      if (!row) {
        return {
          insurerName: null,
          insurerEmail: null,
          annualSampleDate: null,
          lastSampleYear: null,
          emailOnRemoval: false,
          notificationRecipients: [] as string[],
          settings: {},
        };
      }
      const settings =
        typeof row.settings === "object" && row.settings
          ? (row.settings as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        insurerName: row.insurerName,
        insurerEmail: row.insurerEmail,
        annualSampleDate: row.annualSampleDate,
        lastSampleYear: row.lastSampleYear,
        emailOnRemoval: row.emailOnRemoval,
        notificationRecipients: Array.isArray(settings.notificationRecipients)
          ? settings.notificationRecipients
          : [],
        settings,
      };
    });
  }

  async patchSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(industrialFleetDriverSettings)
        .where(eq(industrialFleetDriverSettings.tenantId, principal.tenantId))
        .limit(1);
      const prevSettings =
        existing && typeof existing.settings === "object" && existing.settings
          ? (existing.settings as Record<string, unknown>)
          : {};
      const settings = {
        ...prevSettings,
        ...(typeof body.settings === "object" && body.settings
          ? (body.settings as object)
          : {}),
      };
      if (body.notificationRecipients !== undefined) {
        settings.notificationRecipients = body.notificationRecipients;
      }
      if (!existing) {
        const [row] = await tx
          .insert(industrialFleetDriverSettings)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            insurerName: body.insurerName ? String(body.insurerName) : null,
            insurerEmail: body.insurerEmail ? String(body.insurerEmail) : null,
            annualSampleDate: body.annualSampleDate ? String(body.annualSampleDate) : null,
            lastSampleYear: asInt(body.lastSampleYear),
            emailOnRemoval: asBool(body.emailOnRemoval) ?? false,
            settings,
            sourceSystem: "FORGE",
            sourcePayload: body,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return {
          id: row!.id,
          insurerName: row!.insurerName,
          insurerEmail: row!.insurerEmail,
          annualSampleDate: row!.annualSampleDate,
          lastSampleYear: row!.lastSampleYear,
          emailOnRemoval: row!.emailOnRemoval,
          notificationRecipients: settings.notificationRecipients ?? [],
          settings,
        };
      }
      const [row] = await tx
        .update(industrialFleetDriverSettings)
        .set({
          insurerName:
            body.insurerName !== undefined
              ? body.insurerName
                ? String(body.insurerName)
                : null
              : existing.insurerName,
          insurerEmail:
            body.insurerEmail !== undefined
              ? body.insurerEmail
                ? String(body.insurerEmail)
                : null
              : existing.insurerEmail,
          annualSampleDate:
            body.annualSampleDate !== undefined
              ? body.annualSampleDate
                ? String(body.annualSampleDate)
                : null
              : existing.annualSampleDate,
          lastSampleYear:
            body.lastSampleYear !== undefined ? asInt(body.lastSampleYear) : existing.lastSampleYear,
          emailOnRemoval:
            body.emailOnRemoval !== undefined
              ? (asBool(body.emailOnRemoval) ?? false)
              : existing.emailOnRemoval,
          settings,
          updatedAt: now,
        })
        .where(eq(industrialFleetDriverSettings.id, existing.id))
        .returning();
      return {
        id: row!.id,
        insurerName: row!.insurerName,
        insurerEmail: row!.insurerEmail,
        annualSampleDate: row!.annualSampleDate,
        lastSampleYear: row!.lastSampleYear,
        emailOnRemoval: row!.emailOnRemoval,
        notificationRecipients: settings.notificationRecipients ?? [],
        settings,
      };
    });
  }

  async reportCsv(principal: ForgePrincipal, report: string) {
    const list = await this.listVehicles(principal, {
      page: "1",
      pageSize: "1000",
      removed: report === "removed" ? "true" : undefined,
    });
    const items =
      report === "removed"
        ? (
            await this.listVehicles(principal, {
              page: "1",
              pageSize: "1000",
              removed: "true",
            })
          ).items
        : list.items;

    const headers = [
      "assetNumber",
      "assetType",
      "year",
      "make",
      "model",
      "vin",
      "licensePlate",
      "status",
      "locationName",
      "assignedDriverName",
      "renewalDate",
      "registrationRenewalMonth",
      "insured",
      "insuranceStatus",
      "dotRegulated",
      "countyAssessed",
      "mileage",
      "form2290Status",
      "irpStatus",
      "notOnVehicleFringeSs",
      "commuteUseStatus",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [headers.join(",")];
    for (const row of items) {
      lines.push(headers.map((h) => escape((row as Record<string, unknown>)[h])).join(","));
    }
    return { filename: `fleet-${report || "inventory"}.csv`, csv: lines.join("\n") };
  }

  validateVinHelper(vin: string) {
    return validateVin(vin);
  }

  private industrialAppBaseUrl(override?: string | null): string {
    const raw =
      (typeof override === "string" && override.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgeindustrialsafety.com";
    let normalized = raw.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(normalized);
      normalized = parsed.origin;
    } catch {
      // keep trimmed string when override is not a full URL
    }
    if (!/^https?:\/\//i.test(normalized)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Industrial app URL must start with http:// or https://.",
      );
    }
    if (normalized.length > 256) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Industrial app URL is too long for a DVIR QR code.",
      );
    }
    return normalized;
  }

  private dvirPublicUrl(token: string, appBaseUrl?: string | null): string {
    const safeToken = encodeURIComponent(token);
    return `${this.industrialAppBaseUrl(appBaseUrl)}/dvir/${safeToken}`;
  }

  private storedDvirPublicToken(row: {
    dvirPublicTokenHash: string | null;
    sourcePayload: unknown;
  }): string | null {
    if (!row.dvirPublicTokenHash) return null;
    const stored = String(unwrapPayload(row.sourcePayload).dvirPublicToken ?? "").trim();
    if (!stored || stored.length < 16) return null;
    const hash = createHash("sha256").update(stored).digest("hex");
    return hash === row.dvirPublicTokenHash ? stored : null;
  }

  /**
   * Return the active public DVIR URL for Brady / sticker reprints without rotating
   * the token when the plaintext is still stored on the vehicle payload.
   */
  async ensureDvirQr(
    principal: ForgePrincipal,
    vehicleId: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = assertId(vehicleId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      if (!existing.dotRegulated) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "This asset is not marked DOT regulated. Enable DOT regulated on the asset file before issuing a DVIR QR.",
        );
      }

      const appBase =
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null;
      const reused = this.storedDvirPublicToken(existing);
      if (reused) {
        return {
          token: reused,
          url: this.dvirPublicUrl(reused, appBase),
          reused: true,
          vehicle: mapVehicle(existing),
        };
      }

      const token = randomBytes(24).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const now = new Date();
      const nextPayload = {
        ...unwrapPayload(existing.sourcePayload),
        dvirPublicToken: token,
      };
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({
          dvirPublicTokenHash: tokenHash,
          dvirPublicTokenIssuedAt: now,
          sourcePayload: nextPayload,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      return {
        token,
        url: this.dvirPublicUrl(token, appBase),
        reused: false,
        vehicle: mapVehicle(row),
      };
    });
  }

  async issueDvirQr(
    principal: ForgePrincipal,
    vehicleId: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = assertId(vehicleId);
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      if (!existing.dotRegulated) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "This asset is not marked DOT regulated. Enable DOT regulated on the asset file before issuing a DVIR QR.",
        );
      }

      const nextPayload = {
        ...unwrapPayload(existing.sourcePayload),
        dvirPublicToken: token,
      };
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({
          dvirPublicTokenHash: tokenHash,
          dvirPublicTokenIssuedAt: now,
          sourcePayload: nextPayload,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      const url = this.dvirPublicUrl(
        token,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      return {
        token,
        url,
        reused: false,
        vehicle: mapVehicle(row),
      };
    });
  }

  async revokeDvirQr(principal: ForgePrincipal, vehicleId: string) {
    const recordId = assertId(vehicleId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select({
          id: industrialFleetVehicles.id,
          sourcePayload: industrialFleetVehicles.sourcePayload,
        })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      const prev = unwrapPayload(existing.sourcePayload);
      const { dvirPublicToken: _removed, ...restPayload } = prev;
      const [row] = await tx
        .update(industrialFleetVehicles)
        .set({
          dvirPublicTokenHash: null,
          dvirPublicTokenIssuedAt: null,
          sourcePayload: restPayload,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Vehicle not found");
      return mapVehicle(row);
    });
  }

  async dvirQrImage(
    principal: ForgePrincipal,
    vehicleId: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = assertId(vehicleId);
    const token = String(body.token ?? "").trim();
    if (!token || token.length < 16) {
      throw new ForgeError("VALIDATION_FAILED", "Provide the DVIR QR token from issue.");
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, recordId),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "DVIR QR token is invalid for this vehicle.");
      const url = this.dvirPublicUrl(
        token,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      const assetLabel = fleetVehicleStickerAssetLabel(row);
      const assetName = row.assetNumber?.trim() || assetLabel;
      let qrPng: Buffer;
      try {
        qrPng = await qrCodePngBuffer(url, 320);
      } catch (error) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Could not generate DVIR QR image.",
        );
      }
      const qrPngBase64 = qrPng.toString("base64");
      return {
        contentType: "image/png",
        dataBase64: qrPngBase64,
        qrPngBase64,
        url,
        vehicleLabel: assetLabel,
        assetName,
        assetNumber: row.assetNumber ?? null,
        vin: row.vin ?? null,
      };
    });
  }
}
