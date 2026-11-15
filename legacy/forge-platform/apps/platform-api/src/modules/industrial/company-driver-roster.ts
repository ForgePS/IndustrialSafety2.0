import {
  createId,
  industrialFleetDrivers,
  industrialPersonnel,
  type DatabaseTransaction,
} from "@forge/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import { employeeNumberLookupKeys } from "./employee-number.js";

export type CompanyDriverRosterInput = {
  personnelId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  siteId?: string | null;
  employeeNumber?: string | null;
  /** Stored on sourcePayload.seededFrom for traceability. */
  seededFrom?: string;
};

function normalizeDriverName(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(JR|SR|II|III|IV)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ensure a company-driver roster row exists for personnel, fleet assignment, or
 * a legacy name-only driver record.
 */
export async function ensureCompanyDriverRosterEntry(
  tx: DatabaseTransaction,
  tenantId: string,
  assignment: CompanyDriverRosterInput,
): Promise<string | null> {
  const personnelId = String(assignment.personnelId ?? "").trim() || null;
  const driverId = String(assignment.driverId ?? "").trim() || null;
  const driverName = String(assignment.driverName ?? "").trim() || null;
  const siteId = String(assignment.siteId ?? "").trim() || null;
  const employeeNumber = String(assignment.employeeNumber ?? "").trim() || null;
  const seededFrom = String(assignment.seededFrom ?? "company_driver_roster").trim();
  if (!personnelId && !driverId && !driverName) return null;

  const now = new Date();
  if (personnelId) {
    await tx
      .update(industrialPersonnel)
      .set({ isCompanyDriver: true, updatedAt: now })
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      );
  }

  const syncLinkedFields = async (id: string) => {
    await tx
      .update(industrialFleetDrivers)
      .set({
        archivedAt: null,
        status: "on_insurance",
        ...(personnelId ? { personnelId } : {}),
        ...(driverName ? { personnelName: driverName } : {}),
        ...(siteId ? { siteId } : {}),
        ...(employeeNumber ? { employeeNumber } : {}),
        updatedAt: now,
      })
      .where(and(eq(industrialFleetDrivers.id, id), eq(industrialFleetDrivers.tenantId, tenantId)));
  };

  if (driverId) {
    const [existing] = await tx
      .select({
        id: industrialFleetDrivers.id,
        status: industrialFleetDrivers.status,
        archivedAt: industrialFleetDrivers.archivedAt,
      })
      .from(industrialFleetDrivers)
      .where(
        and(eq(industrialFleetDrivers.id, driverId), eq(industrialFleetDrivers.tenantId, tenantId)),
      )
      .limit(1);
    if (existing) {
      if (existing.archivedAt || String(existing.status ?? "").toLowerCase() === "removed") {
        await syncLinkedFields(existing.id);
      } else if (personnelId || driverName || siteId || employeeNumber) {
        await syncLinkedFields(existing.id);
      }
      return existing.id;
    }
  }

  if (personnelId) {
    const [byPerson] = await tx
      .select({
        id: industrialFleetDrivers.id,
        status: industrialFleetDrivers.status,
        archivedAt: industrialFleetDrivers.archivedAt,
      })
      .from(industrialFleetDrivers)
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          eq(industrialFleetDrivers.personnelId, personnelId),
        ),
      )
      .limit(1);
    if (byPerson) {
      await syncLinkedFields(byPerson.id);
      return byPerson.id;
    }
  }

  if (employeeNumber) {
    const keys = employeeNumberLookupKeys(employeeNumber);
    if (keys.length > 0) {
      const keySql = sql.join(
        keys.map((key) => sql`${key}`),
        sql`, `,
      );
      const [byEmp] = await tx
        .select({
          id: industrialFleetDrivers.id,
          status: industrialFleetDrivers.status,
          archivedAt: industrialFleetDrivers.archivedAt,
        })
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.tenantId, tenantId),
            isNull(industrialFleetDrivers.personnelId),
            sql`(
              lower(btrim(coalesce(${industrialFleetDrivers.employeeNumber}, ''))) in (${keySql})
              or lower(btrim(coalesce(${industrialFleetDrivers.sourcePayload}->>'employeeNumber', ''))) in (${keySql})
            )`,
          ),
        )
        .limit(1);
      if (byEmp) {
        await syncLinkedFields(byEmp.id);
        return byEmp.id;
      }
    }
  }

  if (driverName) {
    const wanted = normalizeDriverName(driverName);
    const named = await tx
      .select({
        id: industrialFleetDrivers.id,
        personnelName: industrialFleetDrivers.personnelName,
        status: industrialFleetDrivers.status,
        archivedAt: industrialFleetDrivers.archivedAt,
      })
      .from(industrialFleetDrivers)
      .where(eq(industrialFleetDrivers.tenantId, tenantId));
    const match = named.find((row) => normalizeDriverName(row.personnelName) === wanted);
    if (match) {
      await syncLinkedFields(match.id);
      return match.id;
    }
  }

  const [inserted] = await tx
    .insert(industrialFleetDrivers)
    .values({
      id: createId(),
      tenantId,
      siteId,
      personnelId,
      personnelName: driverName,
      employeeNumber,
      status: "on_insurance",
      sourceSystem: "FORGE",
      sourceCollection: personnelId ? "personnelCompanyDrivers" : "fleetAssignedDrivers",
      sourceDocumentId: personnelId || `name:${normalizeDriverName(driverName)}`,
      sourcePayload: {
        status: "on_insurance",
        seededFrom,
        personnelName: driverName,
        ...(employeeNumber ? { employeeNumber } : {}),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: industrialFleetDrivers.id });
  return inserted?.id ?? null;
}
