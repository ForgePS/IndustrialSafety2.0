import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialCorrectiveActions,
  industrialDepartments,
  industrialEmploymentTypes,
  industrialFleetDrivers,
  industrialFleetVehicles,
  industrialLotoProcedures,
  industrialLotoRecords,
  industrialPersonnel,
  industrialPositions,
  industrialSites,
  tenantSettings,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import {
  DEFAULT_INCIDENT_BODY_REGIONS,
  normalizeIncidentBodyRegions,
  type IncidentBodyRegion,
} from "./industrial-body-map-defaults.js";

export type PersonnelDivisionEntry = { name: string; siteId: string | null };

/** Normalize legacy string[] and object division catalog entries. */
export function normalizePersonnelDivisionCatalog(raw: unknown): PersonnelDivisionEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonnelDivisionEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let name = "";
    let siteId: string | null = null;
    if (typeof entry === "string") {
      name = entry.trim();
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>;
      name = typeof row.name === "string" ? row.name.trim() : "";
      siteId =
        typeof row.siteId === "string" && row.siteId.trim() !== "" ? row.siteId.trim() : null;
    }
    if (!name) continue;
    const key = `${siteId ?? ""}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, siteId });
  }
  return out.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.siteId ?? "").localeCompare(b.siteId ?? ""),
  );
}

@Injectable()
export class IndustrialService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listSites(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialSites)
        .where(eq(industrialSites.tenantId, tenantId))
        .orderBy(desc(industrialSites.updatedAt));
    });
  }

  async getSite(tenantId: string, siteId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.industrialSites.findFirst({
        where: and(eq(industrialSites.id, siteId), eq(industrialSites.tenantId, tenantId)),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Industrial site not found");
      return row;
    });
  }

  async createSite(tenantId: string, input: { name: string; siteKey?: string; timezone?: string }) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const siteKey =
      input.siteKey?.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const now = new Date();
      const [row] = await tx
        .insert(industrialSites)
        .values({
          id,
          tenantId,
          name,
          siteKey: siteKey || null,
          timezone: input.timezone?.trim() || null,
          status: "ACTIVE",
          sourceSystem: "FORGE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async updateSite(tenantId: string, siteId: string, input: { name: string }) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialSites.findFirst({
        where: and(
          eq(industrialSites.id, siteId),
          eq(industrialSites.tenantId, tenantId),
          isNull(industrialSites.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Industrial site not found");
      const now = new Date();
      const [row] = await tx
        .update(industrialSites)
        .set({ name, updatedAt: now })
        .where(eq(industrialSites.id, siteId))
        .returning();
      return row;
    });
  }

  async archiveSite(tenantId: string, siteId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialSites.findFirst({
        where: and(eq(industrialSites.id, siteId), eq(industrialSites.tenantId, tenantId)),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Industrial site not found");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialSites)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(eq(industrialSites.id, siteId))
        .returning();
      return row;
    });
  }

  async listDepartments(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, tenantId),
            isNull(industrialDepartments.archivedAt),
          ),
        )
        .orderBy(desc(industrialDepartments.updatedAt));
    });
  }

  async createDepartment(
    tenantId: string,
    input: { name: string; description?: string; siteId?: string; divisionName?: string | null },
  ) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const divisionName =
      typeof input.divisionName === "string" && input.divisionName.trim() !== ""
        ? input.divisionName.trim()
        : null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (input.siteId) {
        const site = await tx.query.industrialSites.findFirst({
          where: and(eq(industrialSites.id, input.siteId), eq(industrialSites.tenantId, tenantId)),
        });
        if (!site) throw new ForgeError("NOT_FOUND", "Site not found");
      }
      const existing = await tx
        .select()
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, tenantId),
            sql`lower(${industrialDepartments.name}) = ${name.toLowerCase()}`,
            input.siteId
              ? eq(industrialDepartments.siteId, input.siteId)
              : isNull(industrialDepartments.siteId),
            divisionName
              ? sql`lower(coalesce(${industrialDepartments.divisionName}, '')) = ${divisionName.toLowerCase()}`
              : sql`coalesce(${industrialDepartments.divisionName}, '') = ''`,
            isNull(industrialDepartments.archivedAt),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
      const now = new Date();
      const [row] = await tx
        .insert(industrialDepartments)
        .values({
          id: createId(),
          tenantId,
          siteId: input.siteId ?? null,
          name,
          divisionName,
          status: "ACTIVE",
          sourceSystem: "FORGE",
          sourcePayload: { description: input.description ?? null, division: divisionName },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async updateDepartment(
    tenantId: string,
    departmentId: string,
    input: { name?: string; siteId?: string | null; divisionName?: string | null },
  ) {
    const name = input.name !== undefined ? input.name.trim() : undefined;
    if (name !== undefined && !name) {
      throw new ForgeError("VALIDATION_FAILED", "name is required");
    }
    if (name === undefined && input.siteId === undefined && input.divisionName === undefined) {
      throw new ForgeError("VALIDATION_FAILED", "name, siteId, or divisionName is required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialDepartments.findFirst({
        where: and(
          eq(industrialDepartments.id, departmentId),
          eq(industrialDepartments.tenantId, tenantId),
          isNull(industrialDepartments.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Department not found");
      if (input.siteId) {
        const site = await tx.query.industrialSites.findFirst({
          where: and(eq(industrialSites.id, input.siteId), eq(industrialSites.tenantId, tenantId)),
        });
        if (!site) throw new ForgeError("NOT_FOUND", "Site not found");
      }
      const now = new Date();
      const patch: {
        name?: string;
        siteId?: string | null;
        divisionName?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: now,
      };
      if (name !== undefined) patch.name = name;
      if (input.siteId !== undefined) patch.siteId = input.siteId;
      if (input.divisionName !== undefined) {
        patch.divisionName =
          typeof input.divisionName === "string" && input.divisionName.trim() !== ""
            ? input.divisionName.trim()
            : null;
      }
      const [row] = await tx
        .update(industrialDepartments)
        .set(patch)
        .where(eq(industrialDepartments.id, departmentId))
        .returning();
      return row;
    });
  }

  async archiveDepartment(tenantId: string, departmentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialDepartments.findFirst({
        where: and(
          eq(industrialDepartments.id, departmentId),
          eq(industrialDepartments.tenantId, tenantId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Department not found");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialDepartments)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(eq(industrialDepartments.id, departmentId))
        .returning();
      return row;
    });
  }

  async addPersonnelDivision(tenantId: string, name: string, siteId?: string | null) {
    const trimmed = name.trim();
    if (!trimmed) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const scopedSiteId = typeof siteId === "string" && siteId.trim() !== "" ? siteId.trim() : null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (scopedSiteId) {
        const site = await tx.query.industrialSites.findFirst({
          where: and(eq(industrialSites.id, scopedSiteId), eq(industrialSites.tenantId, tenantId)),
        });
        if (!site) throw new ForgeError("NOT_FOUND", "Site not found");
      }
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, "industrial"),
          eq(tenantSettings.settingKey, "personnel.divisions"),
        ),
      });
      const now = new Date();
      const current = normalizePersonnelDivisionCatalog(existing?.valueJson);
      const lower = trimmed.toLowerCase();
      const already = current.some(
        (entry) => entry.name.toLowerCase() === lower && (entry.siteId ?? null) === scopedSiteId,
      );
      const list = already
        ? current
        : [...current, { name: trimmed, siteId: scopedSiteId }].sort(
            (a, b) =>
              a.name.localeCompare(b.name) || (a.siteId ?? "").localeCompare(b.siteId ?? ""),
          );

      if (existing) {
        await tx
          .update(tenantSettings)
          .set({
            valueJson: list,
            recordVersion: sql`${tenantSettings.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await tx.insert(tenantSettings).values({
          id: createId(),
          tenantId,
          namespace: "industrial",
          settingKey: "personnel.divisions",
          valueJson: list,
          schemaVersion: 1,
          isSensitive: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { name: trimmed, siteId: scopedSiteId, divisions: list };
    });
  }

  async renamePersonnelDivision(
    tenantId: string,
    fromName: string,
    toName: string,
    options?: { fromSiteId?: string | null; siteId?: string | null },
  ) {
    const from = fromName.trim();
    const to = toName.trim();
    if (!from || !to) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const fromSiteId =
      options && "fromSiteId" in options
        ? options.fromSiteId && options.fromSiteId.trim() !== ""
          ? options.fromSiteId.trim()
          : null
        : undefined;
    const nextSiteId =
      options && "siteId" in options
        ? options.siteId && options.siteId.trim() !== ""
          ? options.siteId.trim()
          : null
        : undefined;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (nextSiteId) {
        const site = await tx.query.industrialSites.findFirst({
          where: and(eq(industrialSites.id, nextSiteId), eq(industrialSites.tenantId, tenantId)),
        });
        if (!site) throw new ForgeError("NOT_FOUND", "Site not found");
      }
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, "industrial"),
          eq(tenantSettings.settingKey, "personnel.divisions"),
        ),
      });
      const list = normalizePersonnelDivisionCatalog(existing?.valueJson);
      const fromLower = from.toLowerCase();
      const idx = list.findIndex((entry) => {
        if (entry.name.toLowerCase() !== fromLower) return false;
        if (fromSiteId === undefined) return true;
        return (entry.siteId ?? null) === fromSiteId;
      });
      if (idx < 0 || !existing) throw new ForgeError("NOT_FOUND", "Division not found");
      const toLower = to.toLowerCase();
      const resolvedSiteId = nextSiteId !== undefined ? nextSiteId : list[idx]!.siteId;
      if (
        list.some(
          (entry, i) =>
            i !== idx &&
            entry.name.toLowerCase() === toLower &&
            (entry.siteId ?? null) === resolvedSiteId,
        )
      ) {
        throw new ForgeError("VALIDATION_FAILED", "A division with that name already exists");
      }
      const next = [...list];
      next[idx] = { name: to, siteId: resolvedSiteId };
      next.sort(
        (a, b) => a.name.localeCompare(b.name) || (a.siteId ?? "").localeCompare(b.siteId ?? ""),
      );
      await tx
        .update(tenantSettings)
        .set({
          valueJson: next,
          recordVersion: sql`${tenantSettings.recordVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tenantSettings.id, existing.id));
      return { name: to, siteId: resolvedSiteId, previousName: from, divisions: next };
    });
  }

  async removePersonnelDivision(tenantId: string, name: string, siteId?: string | null) {
    const trimmed = name.trim();
    if (!trimmed) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const scopedSiteId =
      siteId === undefined
        ? undefined
        : typeof siteId === "string" && siteId.trim() !== ""
          ? siteId.trim()
          : null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, "industrial"),
          eq(tenantSettings.settingKey, "personnel.divisions"),
        ),
      });
      const list = normalizePersonnelDivisionCatalog(existing?.valueJson);
      const lower = trimmed.toLowerCase();
      const next = list.filter((entry) => {
        if (entry.name.toLowerCase() !== lower) return true;
        if (scopedSiteId === undefined) return false;
        return (entry.siteId ?? null) !== scopedSiteId;
      });
      if (!existing || next.length === list.length) {
        throw new ForgeError("NOT_FOUND", "Division not found");
      }
      await tx
        .update(tenantSettings)
        .set({
          valueJson: next,
          recordVersion: sql`${tenantSettings.recordVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tenantSettings.id, existing.id));
      return { name: trimmed, siteId: scopedSiteId ?? null, divisions: next };
    });
  }

  async listPositions(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialPositions)
        .where(
          and(eq(industrialPositions.tenantId, tenantId), isNull(industrialPositions.archivedAt)),
        )
        .orderBy(desc(industrialPositions.updatedAt));
    });
  }

  async createPosition(
    tenantId: string,
    input: { name: string; description?: string; departmentId?: string },
  ) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (input.departmentId) {
        const dept = await tx.query.industrialDepartments.findFirst({
          where: and(
            eq(industrialDepartments.id, input.departmentId),
            eq(industrialDepartments.tenantId, tenantId),
          ),
        });
        if (!dept) throw new ForgeError("NOT_FOUND", "Department not found");
      }
      const existing = await tx
        .select()
        .from(industrialPositions)
        .where(
          and(
            eq(industrialPositions.tenantId, tenantId),
            sql`lower(${industrialPositions.name}) = ${name.toLowerCase()}`,
            isNull(industrialPositions.archivedAt),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
      const now = new Date();
      const [row] = await tx
        .insert(industrialPositions)
        .values({
          id: createId(),
          tenantId,
          name,
          description: input.description,
          departmentId: input.departmentId,
          status: "ACTIVE",
          sourceSystem: "FORGE",
          sourcePayload: { description: input.description ?? null },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async archivePosition(tenantId: string, positionId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialPositions.findFirst({
        where: and(
          eq(industrialPositions.id, positionId),
          eq(industrialPositions.tenantId, tenantId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Position not found");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialPositions)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(eq(industrialPositions.id, positionId))
        .returning();
      return row;
    });
  }

  async updatePosition(
    tenantId: string,
    positionId: string,
    input: { name: string; departmentId?: string | null },
  ) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialPositions.findFirst({
        where: and(
          eq(industrialPositions.id, positionId),
          eq(industrialPositions.tenantId, tenantId),
          isNull(industrialPositions.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Position not found");
      if (input.departmentId) {
        const dept = await tx.query.industrialDepartments.findFirst({
          where: and(
            eq(industrialDepartments.id, input.departmentId),
            eq(industrialDepartments.tenantId, tenantId),
          ),
        });
        if (!dept) throw new ForgeError("NOT_FOUND", "Department not found");
      }
      const now = new Date();
      const patch: {
        name: string;
        departmentId?: string | null;
        updatedAt: Date;
      } = { name, updatedAt: now };
      if (input.departmentId !== undefined) {
        patch.departmentId = input.departmentId;
      }
      const [row] = await tx
        .update(industrialPositions)
        .set(patch)
        .where(eq(industrialPositions.id, positionId))
        .returning();
      return row;
    });
  }

  async listEmploymentTypes(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialEmploymentTypes)
        .where(
          and(
            eq(industrialEmploymentTypes.tenantId, tenantId),
            isNull(industrialEmploymentTypes.archivedAt),
          ),
        )
        .orderBy(desc(industrialEmploymentTypes.updatedAt));
    });
  }

  async createEmploymentType(tenantId: string, input: { name: string; description?: string }) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(industrialEmploymentTypes)
        .where(
          and(
            eq(industrialEmploymentTypes.tenantId, tenantId),
            sql`lower(${industrialEmploymentTypes.name}) = ${name.toLowerCase()}`,
            isNull(industrialEmploymentTypes.archivedAt),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
      const now = new Date();
      const [row] = await tx
        .insert(industrialEmploymentTypes)
        .values({
          id: createId(),
          tenantId,
          name,
          description: input.description,
          status: "ACTIVE",
          sourceSystem: "FORGE",
          sourcePayload: { description: input.description ?? null },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async archiveEmploymentType(tenantId: string, employmentTypeId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialEmploymentTypes.findFirst({
        where: and(
          eq(industrialEmploymentTypes.id, employmentTypeId),
          eq(industrialEmploymentTypes.tenantId, tenantId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Employment type not found");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialEmploymentTypes)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(eq(industrialEmploymentTypes.id, employmentTypeId))
        .returning();
      return row;
    });
  }

  async updateEmploymentType(tenantId: string, employmentTypeId: string, input: { name: string }) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialEmploymentTypes.findFirst({
        where: and(
          eq(industrialEmploymentTypes.id, employmentTypeId),
          eq(industrialEmploymentTypes.tenantId, tenantId),
          isNull(industrialEmploymentTypes.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Employment type not found");
      const now = new Date();
      const [row] = await tx
        .update(industrialEmploymentTypes)
        .set({ name, updatedAt: now })
        .where(eq(industrialEmploymentTypes.id, employmentTypeId))
        .returning();
      return row;
    });
  }

  async listPersonnel(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialPersonnel)
        .where(
          and(eq(industrialPersonnel.tenantId, tenantId), isNull(industrialPersonnel.archivedAt)),
        )
        .orderBy(desc(industrialPersonnel.updatedAt));
    });
  }

  async createMissingOrgLookup(
    tenantId: string,
    input: {
      kind: "division" | "department" | "position" | "employment_type";
      name: string;
      description?: string;
      siteId?: string;
      departmentId?: string;
      divisionName?: string;
    },
  ) {
    const name = input.name?.trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    if (input.kind === "division") {
      return this.addPersonnelDivision(tenantId, name, input.siteId ?? null);
    }
    if (input.kind === "department") {
      const departmentInput: Parameters<IndustrialService["createDepartment"]>[1] = { name };
      if (input.description !== undefined) departmentInput.description = input.description;
      if (input.siteId) departmentInput.siteId = input.siteId;
      if (input.divisionName) departmentInput.divisionName = input.divisionName;
      return this.createDepartment(tenantId, departmentInput);
    }
    if (input.kind === "position") {
      const positionInput: Parameters<IndustrialService["createPosition"]>[1] = { name };
      if (input.description !== undefined) positionInput.description = input.description;
      if (input.departmentId) positionInput.departmentId = input.departmentId;
      return this.createPosition(tenantId, positionInput);
    }
    if (input.kind === "employment_type") {
      return this.createEmploymentType(
        tenantId,
        input.description !== undefined ? { name, description: input.description } : { name },
      );
    }
    throw new ForgeError("VALIDATION_FAILED", "Invalid org lookup kind");
  }

  async listLotoProcedures(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialLotoProcedures)
        .where(eq(industrialLotoProcedures.tenantId, tenantId))
        .orderBy(desc(industrialLotoProcedures.updatedAt));
    });
  }

  async listLotoRecords(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialLotoRecords)
        .where(eq(industrialLotoRecords.tenantId, tenantId))
        .orderBy(desc(industrialLotoRecords.updatedAt));
    });
  }

  async listFleetVehicles(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialFleetVehicles)
        .where(eq(industrialFleetVehicles.tenantId, tenantId))
        .orderBy(desc(industrialFleetVehicles.updatedAt));
    });
  }

  async createFleetVehicle(
    tenantId: string,
    input: {
      year?: number;
      make?: string;
      model?: string;
      color?: string;
      vin?: string;
      licensePlate?: string;
      renewalDate?: string;
      locationName?: string;
      countyAssessed?: string;
      insured?: boolean;
      mileage?: number;
      notes?: string;
      vehicleFringe?: boolean;
    },
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const now = new Date();
      const [row] = await tx
        .insert(industrialFleetVehicles)
        .values({
          id,
          tenantId,
          year: input.year,
          make: input.make,
          model: input.model,
          color: input.color,
          vin: input.vin,
          licensePlate: input.licensePlate,
          renewalDate: input.renewalDate,
          locationName: input.locationName,
          countyAssessed: input.countyAssessed,
          insured: input.insured,
          mileage: input.mileage,
          notes: input.notes,
          vehicleFringe: input.vehicleFringe,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async listFleetDrivers(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialFleetDrivers)
        .where(eq(industrialFleetDrivers.tenantId, tenantId))
        .orderBy(desc(industrialFleetDrivers.updatedAt));
    });
  }

  async listCorrectiveActions(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialCorrectiveActions)
        .where(eq(industrialCorrectiveActions.tenantId, tenantId))
        .orderBy(desc(industrialCorrectiveActions.updatedAt));
    });
  }

  async createCorrectiveAction(
    tenantId: string,
    input: {
      title: string;
      parentEntityType: string;
      parentEntityId?: string;
      description?: string;
      priority?: string;
      dueDate?: string;
    },
  ) {
    if (!input.title?.trim()) {
      throw new ForgeError("VALIDATION_FAILED", "title is required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const now = new Date();
      const [row] = await tx
        .insert(industrialCorrectiveActions)
        .values({
          id,
          tenantId,
          title: input.title.trim(),
          parentEntityType: input.parentEntityType,
          parentEntityId: input.parentEntityId,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  private static readonly BODY_MAP_NAMESPACE = "industrial";
  private static readonly BODY_MAP_SETTING_KEY = "incidents.body_regions";

  async getBodyMapConfig(tenantId: string): Promise<{
    regions: IncidentBodyRegion[];
    isCustom: boolean;
    updatedAt: string | null;
  }> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, IndustrialService.BODY_MAP_NAMESPACE),
          eq(tenantSettings.settingKey, IndustrialService.BODY_MAP_SETTING_KEY),
        ),
      });

      if (!row || !Array.isArray(row.valueJson)) {
        return {
          regions: [...DEFAULT_INCIDENT_BODY_REGIONS],
          isCustom: false,
          updatedAt: null,
        };
      }

      try {
        return {
          regions: normalizeIncidentBodyRegions(row.valueJson),
          isCustom: true,
          updatedAt: row.updatedAt?.toISOString() ?? null,
        };
      } catch {
        return {
          regions: [...DEFAULT_INCIDENT_BODY_REGIONS],
          isCustom: false,
          updatedAt: null,
        };
      }
    });
  }

  async saveBodyMapConfig(
    tenantId: string,
    rawRegions: unknown,
  ): Promise<{
    regions: IncidentBodyRegion[];
    isCustom: boolean;
    updatedAt: string;
  }> {
    let regions: IncidentBodyRegion[];
    try {
      regions = normalizeIncidentBodyRegions(rawRegions);
    } catch (error) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        error instanceof Error ? error.message : "Invalid body map regions",
      );
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, IndustrialService.BODY_MAP_NAMESPACE),
          eq(tenantSettings.settingKey, IndustrialService.BODY_MAP_SETTING_KEY),
        ),
      });
      const now = new Date();

      if (existing) {
        await tx
          .update(tenantSettings)
          .set({
            valueJson: regions,
            recordVersion: sql`${tenantSettings.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await tx.insert(tenantSettings).values({
          id: createId(),
          tenantId,
          namespace: IndustrialService.BODY_MAP_NAMESPACE,
          settingKey: IndustrialService.BODY_MAP_SETTING_KEY,
          valueJson: regions,
          schemaVersion: 1,
          isSensitive: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        regions,
        isCustom: true,
        updatedAt: now.toISOString(),
      };
    });
  }
}
