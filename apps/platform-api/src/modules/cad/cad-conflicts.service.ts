import { Inject, Injectable } from "@nestjs/common";
import { CAD_AUDIT_ACTIONS, CAD_FEATURE_FLAGS } from "@forge/cad-contracts";
import {
  cadConflicts,
  cadIncidentLinks,
  createId,
  featureDefinitions,
  featureOverrides,
  nerisIncidents,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { resolveFeatureValue } from "@forge/authorization";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

const resolveConflictSchema = z.object({
  resolutionAction: z.enum([
    "USE_CAD",
    "KEEP_FORGE",
    "MERGE",
    "LINK",
    "UNLINK",
    "CREATE_NEW",
    "IGNORE",
    "ESCALATE",
    "CORRECT_MAPPING",
  ]),
  resolutionReason: z.string().min(1).max(2000),
  recordVersion: z.number().int().positive(),
});

const linkSchema = z.object({
  cadConnectionId: z.string().uuid(),
  sourceIncidentId: z.string().min(1).max(200),
  sourceIncidentNumber: z.string().max(120).optional().nullable(),
  reason: z.string().min(1).max(2000),
  recordVersion: z.number().int().positive().optional(),
});

@Injectable()
export class CadConflictsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async assertCadEnabled(tenantId: string): Promise<void> {
    const enabled = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.ENABLED);
    if (!enabled) {
      throw new ForgeError("FORBIDDEN", "CAD is not enabled for this tenant");
    }
  }

  async listConflicts(tenantId: string, query: { status?: string; incidentId?: string }) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters = [eq(cadConflicts.tenantId, tenantId)];
      if (query.status) filters.push(eq(cadConflicts.status, query.status));
      if (query.incidentId) filters.push(eq(cadConflicts.incidentId, query.incidentId));
      return tx
        .select()
        .from(cadConflicts)
        .where(and(...filters))
        .orderBy(desc(cadConflicts.createdAt))
        .limit(200);
    });
  }

  async getConflict(tenantId: string, conflictId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.cadConflicts.findFirst({
        where: and(eq(cadConflicts.tenantId, tenantId), eq(cadConflicts.id, conflictId)),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "CAD conflict not found");
      return row;
    });
  }

  async resolve(tenantId: string, conflictId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    const data = resolveConflictSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadConflicts.findFirst({
          where: and(eq(cadConflicts.tenantId, tenantId), eq(cadConflicts.id, conflictId)),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "CAD conflict not found");
        if (row.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Conflict record version mismatch");
        }
        if (row.status !== "OPEN" && row.status !== "ESCALATED") {
          throw new ForgeError("BAD_REQUEST", "Conflict is already resolved");
        }

        const needsReason =
          data.resolutionAction === "IGNORE" ||
          data.resolutionAction === "KEEP_FORGE" ||
          data.resolutionAction === "UNLINK" ||
          data.resolutionAction === "CREATE_NEW";
        if (needsReason && !data.resolutionReason.trim()) {
          throw new ForgeError("BAD_REQUEST", "Resolution reason is required");
        }

        const [updated] = await tx
          .update(cadConflicts)
          .set({
            status: data.resolutionAction === "ESCALATE" ? "ESCALATED" : "MANUALLY_RESOLVED",
            resolutionAction: data.resolutionAction,
            resolutionReason: data.resolutionReason,
            resolvedAt: data.resolutionAction === "ESCALATE" ? null : new Date(),
            resolvedByUserId: principal.userId,
            escalatedAt: data.resolutionAction === "ESCALATE" ? new Date() : row.escalatedAt,
            recordVersion: row.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadConflicts.id, conflictId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action:
            data.resolutionAction === "ESCALATE"
              ? CAD_AUDIT_ACTIONS.CONFLICT_ESCALATED
              : CAD_AUDIT_ACTIONS.CONFLICT_RESOLVED,
          resourceType: "cad_conflict",
          resourceId: conflictId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: updated,
        });

        return updated;
      },
      principal.userId,
    );
  }

  async getIncidentLink(tenantId: string, incidentId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.cadIncidentLinks.findMany({
        where: and(
          eq(cadIncidentLinks.tenantId, tenantId),
          eq(cadIncidentLinks.incidentId, incidentId),
          inArray(cadIncidentLinks.linkStatus, ["ACTIVE", "SUSPENDED", "CONFLICT"]),
        ),
      });
    });
  }

  async linkIncident(
    tenantId: string,
    incidentId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = linkSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const incident = await tx.query.nerisIncidents.findFirst({
          where: and(eq(nerisIncidents.tenantId, tenantId), eq(nerisIncidents.id, incidentId)),
        });
        if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
        if (incident.status === "FINALIZED") {
          throw new ForgeError(
            "FORBIDDEN",
            "Finalized incidents cannot be linked without correction authority",
          );
        }

        const duplicate = await tx.query.cadIncidentLinks.findFirst({
          where: and(
            eq(cadIncidentLinks.tenantId, tenantId),
            eq(cadIncidentLinks.cadConnectionId, data.cadConnectionId),
            eq(cadIncidentLinks.sourceIncidentId, data.sourceIncidentId),
            inArray(cadIncidentLinks.linkStatus, ["ACTIVE", "SUSPENDED", "CONFLICT"]),
          ),
        });
        if (duplicate && duplicate.incidentId !== incidentId) {
          throw new ForgeError(
            "CONFLICT",
            "Source incident is already linked to another Forge incident",
          );
        }

        const id = createId();
        const [link] = await tx
          .insert(cadIncidentLinks)
          .values({
            id,
            tenantId,
            incidentId,
            cadConnectionId: data.cadConnectionId,
            sourceIncidentId: data.sourceIncidentId,
            sourceIncidentNumber: data.sourceIncidentNumber ?? null,
            linkStatus: "ACTIVE",
            linkMethod: "MANUAL",
            linkedByUserId: principal.userId,
            matchDetailsJson: { reason: data.reason },
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.INCIDENT_LINKED,
          resourceType: "cad_incident_link",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: link,
        });

        return link;
      },
      principal.userId,
    );
  }

  async unlinkIncident(
    tenantId: string,
    incidentId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = z
      .object({
        cadIncidentLinkId: z.string().uuid(),
        reason: z.string().min(1).max(2000),
        recordVersion: z.number().int().positive(),
      })
      .parse(body);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const link = await tx.query.cadIncidentLinks.findFirst({
          where: and(
            eq(cadIncidentLinks.tenantId, tenantId),
            eq(cadIncidentLinks.incidentId, incidentId),
            eq(cadIncidentLinks.id, data.cadIncidentLinkId),
          ),
        });
        if (!link) throw new ForgeError("NOT_FOUND", "CAD link not found");
        if (link.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Link record version mismatch");
        }

        const [updated] = await tx
          .update(cadIncidentLinks)
          .set({
            linkStatus: "UNLINKED",
            manualOverrideReason: data.reason,
            recordVersion: link.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadIncidentLinks.id, link.id))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.INCIDENT_UNLINKED,
          resourceType: "cad_incident_link",
          resourceId: link.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: updated,
        });

        return updated;
      },
      principal.userId,
    );
  }

  private async resolveFlag(tenantId: string, key: string): Promise<boolean> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const def = await tx.query.featureDefinitions.findFirst({
        where: eq(featureDefinitions.key, key),
      });
      if (!def) return false;
      const overrides = await tx.query.featureOverrides.findMany({
        where: and(
          eq(featureOverrides.tenantId, tenantId),
          eq(featureOverrides.featureDefinitionId, def.id),
          isNull(featureOverrides.organizationId),
          isNull(featureOverrides.userId),
        ),
      });
      const value = resolveFeatureValue({
        tenant: overrides[0]?.valueJson as unknown,
        defaultValue: def.defaultValueJson as unknown,
      });
      return value === true;
    });
  }
}
