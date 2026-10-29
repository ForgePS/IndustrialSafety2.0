import { Inject, Injectable } from "@nestjs/common";
import {
  batchUpsertFieldValuesInputSchema,
  createIncidentInputSchema,
  duplicateCheckInputSchema,
  pageQuerySchema,
  patchIncidentInputSchema,
  returnIncidentInputSchema,
  reopenReviewCommentInputSchema,
  resolveReviewCommentInputSchema,
  reviewCommentInputSchema,
  submitReviewInputSchema,
  upsertNarrativeInputSchema,
  voidIncidentInputSchema,
  type NerisIncidentStatus,
} from "@forge/contracts";
import {
  createId,
  cadManualFallbackSessions,
  nerisIncidentActivity,
  nerisIncidentConfigurationSnapshots,
  nerisIncidentFieldValues,
  nerisIncidentNarratives,
  nerisIncidentNarrativeVersions,
  nerisIncidentReviewAssignments,
  nerisIncidentReviewComments,
  nerisIncidentSchemaSnapshots,
  nerisIncidentSections,
  nerisIncidentStatusHistory,
  nerisIncidentValidationResults,
  nerisIncidentValidationRuns,
  nerisIncidents,
  nerisFields,
  tenantNerisConfiguration,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import { SPECIALTY_WORKFLOW_GROUPS } from "@forge/neris";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import {
  DEFAULT_INCIDENT_SECTIONS,
  IncidentFormDescriptorService,
} from "./incident-form-descriptor.service.js";
import { IncidentNumberingService } from "./incident-numbering.service.js";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";
import { IncidentValidationService } from "./incident-validation.service.js";
import { NerisIncidentsAccessService } from "./neris-incidents-access.service.js";
import { NerisSchemaRegistryService } from "../neris/neris-schema-registry.service.js";

type ExpectedVersion = number | "*";

@Injectable()
export class NerisIncidentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly access: NerisIncidentsAccessService,
    private readonly numbering: IncidentNumberingService,
    private readonly stateMachine: IncidentStateMachineService,
    private readonly validation: IncidentValidationService,
    private readonly formDescriptor: IncidentFormDescriptorService,
    private readonly schemaRegistry: NerisSchemaRegistryService,
  ) {}

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    await this.access.assertManualIntakeEnabled(principal);
    const data = createIncidentInputSchema.parse(input);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const config = await tx.query.tenantNerisConfiguration.findFirst({
          where: eq(tenantNerisConfiguration.tenantId, tenantId),
        });
        const operatingMode = config?.operatingMode ?? "MANUAL_ONLY";
        const allowManualWhenCad = config?.allowManualCreationWhenCadEnabled ?? true;

        if (operatingMode === "CAD_ENABLED" && !allowManualWhenCad) {
          const activeFallback = await tx.query.cadManualFallbackSessions.findFirst({
            where: and(
              eq(cadManualFallbackSessions.tenantId, tenantId),
              eq(cadManualFallbackSessions.status, "ACTIVE"),
            ),
          });
          const canOverride = hasPermission(principal, "rms.cad.incident.manual_override");
          if (!activeFallback && !canOverride) {
            throw new ForgeError(
              "FORBIDDEN",
              "Manual incident creation is restricted while CAD_ENABLED. Declare a CAD outage fallback or use manual override.",
            );
          }
          if (!activeFallback && canOverride && config?.manualOverrideRequiresReason) {
            const reason =
              typeof input === "object" &&
              input &&
              "manualOverrideReason" in input &&
              typeof (input as { manualOverrideReason?: unknown }).manualOverrideReason === "string"
                ? (input as { manualOverrideReason: string }).manualOverrideReason
                : "";
            if (!reason.trim()) {
              throw new ForgeError(
                "BAD_REQUEST",
                "manualOverrideReason is required when creating incidents under CAD_ENABLED without an active fallback",
              );
            }
          }
        }

        const published = await this.schemaRegistry.getPublishedVersion();
        if (!published) {
          throw new ForgeError("NOT_FOUND", "No published NERIS schema version");
        }

        const incidentDate = data.incidentDate
          ? new Date(`${data.incidentDate}T00:00:00.000Z`)
          : new Date();

        const { number, ledgerId } = await this.numbering.claimNextNumber(
          tx,
          tenantId,
          {
            incidentDate,
            stationId: data.stationId ?? null,
            categoryKey: data.primaryIncidentTypeCode ?? null,
          },
          principal.userId,
          data.manualNumber ? data.incidentNumber : undefined,
        );

        const id = createId();
        const now = new Date();
        const [incident] = await tx
          .insert(nerisIncidents)
          .values({
            id,
            tenantId,
            incidentNumber: number,
            status: "DRAFT",
            schemaVersionId: published.id,
            incidentDate: data.incidentDate ?? incidentDate.toISOString().slice(0, 10),
            alarmAt: data.alarmAt ? new Date(data.alarmAt) : null,
            stationId: data.stationId,
            shiftId: data.shiftId,
            responseDistrict: data.responseDistrict,
            incidentSource: data.incidentSource ?? "MANUAL",
            dispatchDescription: data.dispatchDescription,
            mutualAidStatus: data.mutualAidStatus,
            aidDirection: data.aidDirection,
            incidentCommanderPersonnelId: data.incidentCommanderPersonnelId,
            reportOwnerUserId: data.reportOwnerUserId ?? principal.userId,
            primaryIncidentTypeCode: data.primaryIncidentTypeCode,
            operatingMode,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!incident) throw new ForgeError("INTERNAL_ERROR", "Failed to create incident");

        await this.numbering.bindNumberToIncident(tx, tenantId, ledgerId, id);

        await tx.insert(nerisIncidentSections).values(
          DEFAULT_INCIDENT_SECTIONS.map((sectionKey) => ({
            id: createId(),
            tenantId,
            incidentId: id,
            sectionKey,
            createdAt: now,
            updatedAt: now,
          })),
        );

        const snapshot = await this.formDescriptor.buildSchemaSnapshot(published.id);
        const checksum = this.numbering.checksumSnapshot(snapshot);
        await tx.insert(nerisIncidentSchemaSnapshots).values({
          id: createId(),
          tenantId,
          incidentId: id,
          schemaVersionId: published.id,
          checksumSha256: checksum,
          snapshotJson: snapshot,
          createdAt: now,
        });

        await tx.insert(nerisIncidentStatusHistory).values({
          id: createId(),
          tenantId,
          incidentId: id,
          fromStatus: null,
          toStatus: "DRAFT",
          actorUserId: principal.userId,
          createdAt: now,
        });

        await this.emitIncidentEvent(
          tx,
          tenantId,
          id,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_CREATED,
          principal,
          {
            incidentId: id,
            incidentNumber: number,
            status: "DRAFT",
          },
        );
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "neris.incident.create",
          resourceType: "neris_incident",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: incident,
        });

        return incident;
      },
      principal.userId,
    );
  }

  async list(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    const offset = (page - 1) * pageSize;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters = [eq(nerisIncidents.tenantId, tenantId), isNull(nerisIncidents.deletedAt)];
      if (search?.trim()) {
        const q = `%${search.trim()}%`;
        filters.push(
          or(
            ilike(nerisIncidents.incidentNumber, q),
            ilike(nerisIncidents.dispatchDescription, q),
            ilike(nerisIncidents.primaryIncidentTypeCode, q),
          )!,
        );
      }
      const where = and(...filters);
      const items = await tx
        .select()
        .from(nerisIncidents)
        .where(where)
        .orderBy(desc(nerisIncidents.createdAt))
        .limit(pageSize)
        .offset(offset);
      const totalRows = await tx.select({ total: count() }).from(nerisIncidents).where(where);
      return { items, page, pageSize, total: totalRows[0]?.total ?? 0 };
    });
  }

  async get(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      const sections = await tx.query.nerisIncidentSections.findMany({
        where: eq(nerisIncidentSections.incidentId, incidentId),
      });
      return { ...incident, sections };
    });
  }

  async patch(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    const data = patchIncidentInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await this.requireIncident(tx, tenantId, incidentId);
        this.stateMachine.assertEditable(before.status as NerisIncidentStatus);
        const updated = await this.versionedUpdate(
          tx,
          tenantId,
          incidentId,
          before,
          {
            ...data,
            alarmAt:
              data.alarmAt !== undefined
                ? data.alarmAt
                  ? new Date(data.alarmAt)
                  : null
                : undefined,
            status: this.stateMachine.promoteDraftIfNeeded(before.status as NerisIncidentStatus),
            updatedByUserId: principal.userId,
          },
          principal,
          expected,
        );
        if (updated.status !== before.status) {
          await this.recordStatusChange(
            tx,
            tenantId,
            incidentId,
            before.status,
            updated.status,
            principal,
          );
        }
        return updated;
      },
      principal.userId,
    );
  }

  async batchUpsertFieldValues(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    const data = batchUpsertFieldValuesInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const incident = await this.requireIncident(tx, tenantId, incidentId);
        this.stateMachine.assertEditable(incident.status as NerisIncidentStatus);
        if (expected !== "*" && incident.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident",
            resourceId: incidentId,
            expectedVersion: expected,
            actualVersion: incident.recordVersion,
          });
        }

        const results = [];
        for (const value of data.values) {
          const [existing] = await tx
            .select()
            .from(nerisIncidentFieldValues)
            .where(
              and(
                eq(nerisIncidentFieldValues.incidentId, incidentId),
                eq(nerisIncidentFieldValues.fieldId, value.fieldId),
                eq(nerisIncidentFieldValues.sectionKey, value.sectionKey),
                value.repeatableItemId
                  ? eq(nerisIncidentFieldValues.repeatableItemId, value.repeatableItemId)
                  : isNull(nerisIncidentFieldValues.repeatableItemId),
              ),
            )
            .limit(1);

          if (existing?.userConfirmed && value.userConfirmed !== true) {
            results.push(existing);
            continue;
          }

          const now = new Date();
          const payload = {
            valueText: value.valueText,
            valueNumber: value.valueNumber !== undefined ? String(value.valueNumber) : undefined,
            valueBoolean: value.valueBoolean,
            valueTimestamp: value.valueTimestamp ? new Date(value.valueTimestamp) : undefined,
            valueOptionId: value.valueOptionId,
            valueJson: value.valueJson,
            prefillSource: value.prefillSource,
            userConfirmed: value.userConfirmed ?? existing?.userConfirmed ?? false,
            updatedByUserId: principal.userId,
            updatedAt: now,
          };

          if (existing) {
            const [row] = await tx
              .update(nerisIncidentFieldValues)
              .set({ ...payload, recordVersion: existing.recordVersion + 1 })
              .where(eq(nerisIncidentFieldValues.id, existing.id))
              .returning();
            results.push(row);
          } else {
            const [row] = await tx
              .insert(nerisIncidentFieldValues)
              .values({
                id: createId(),
                tenantId,
                incidentId,
                fieldId: value.fieldId,
                sectionKey: value.sectionKey,
                repeatableItemId: value.repeatableItemId,
                ...payload,
                createdByUserId: principal.userId,
                createdAt: now,
              })
              .returning();
            results.push(row);
          }
        }

        const newStatus = this.stateMachine.promoteDraftIfNeeded(
          incident.status as NerisIncidentStatus,
        );
        const [updatedIncident] = await tx
          .update(nerisIncidents)
          .set({
            status: newStatus,
            recordVersion: incident.recordVersion + 1,
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(nerisIncidents.id, incidentId),
              eq(nerisIncidents.recordVersion, incident.recordVersion),
            ),
          )
          .returning();

        if (newStatus !== incident.status && updatedIncident) {
          await this.recordStatusChange(
            tx,
            tenantId,
            incidentId,
            incident.status,
            newStatus,
            principal,
          );
        }

        return { incident: updatedIncident ?? incident, values: results };
      },
      principal.userId,
    );
  }

  async validate(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      return this.validation.runValidation(tx, tenantId, incidentId, incident, "MANUAL", principal);
    });
  }

  async submitForReview(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    await this.access.assertOfficerReviewEnabled(principal);
    const data = submitReviewInputSchema.parse(input);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      (from) => this.stateMachine.nextOnSubmit(from),
      async (tx, incident) => {
        await this.validation.assertNoBlockingErrors(
          tx,
          tenantId,
          incidentId,
          incident,
          "SUBMIT_FOR_REVIEW",
          principal,
        );
        await this.writeConfigurationSnapshot(
          tx,
          tenantId,
          incidentId,
          "SUBMIT_FOR_REVIEW",
          principal,
        );
        await tx.insert(nerisIncidentReviewAssignments).values({
          id: createId(),
          tenantId,
          incidentId,
          reviewerUserId: data.reviewerUserId,
          status: "PENDING",
          submissionNote: data.note,
          assignedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_SUBMITTED_FOR_REVIEW,
          principal,
          { note: data.note },
        );
      },
    );
  }

  async returnIncident(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    await this.access.assertOfficerReviewEnabled(principal);
    const data = returnIncidentInputSchema.parse(input);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      () => this.stateMachine.nextOnReturn(),
      async (tx) => {
        if (data.comments.length > 0) {
          await tx.insert(nerisIncidentReviewComments).values(
            data.comments.map((c) => ({
              id: createId(),
              tenantId,
              incidentId,
              sectionKey: c.sectionKey,
              fieldId: c.fieldId,
              body: c.body,
              authorUserId: principal.userId,
              createdAt: new Date(),
            })),
          );
        }
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_RETURNED,
          principal,
          { reason: data.reason },
        );
      },
      data.reason,
    );
  }

  async approve(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertIncidentShellEnabled(principal);
    await this.access.assertOfficerReviewEnabled(principal);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      () => this.stateMachine.nextOnApprove(),
      async (tx, incident) => {
        await tx
          .update(nerisIncidents)
          .set({ approvedAt: new Date() })
          .where(eq(nerisIncidents.id, incident.id));
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_APPROVED,
          principal,
          {},
        );
      },
    );
  }

  async finalize(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertIncidentShellEnabled(principal);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      () => this.stateMachine.nextOnFinalize(),
      async (tx, incident) => {
        await this.validation.assertNoBlockingErrors(
          tx,
          tenantId,
          incidentId,
          incident,
          "FINALIZE",
          principal,
        );
        await this.writeConfigurationSnapshot(tx, tenantId, incidentId, "FINALIZE", principal);
        await tx
          .update(nerisIncidents)
          .set({ finalizedAt: new Date() })
          .where(eq(nerisIncidents.id, incident.id));
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_FINALIZED,
          principal,
          {},
        );
      },
    );
  }

  async voidIncident(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    const data = voidIncidentInputSchema.parse(input);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      () => this.stateMachine.nextOnVoid(),
      async (tx, incident) => {
        await tx
          .update(nerisIncidents)
          .set({ voidReason: data.reason })
          .where(eq(nerisIncidents.id, incident.id));
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_VOIDED,
          principal,
          { reason: data.reason },
        );
      },
      data.reason,
    );
  }

  async archive(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertIncidentShellEnabled(principal);
    return this.transition(
      tenantId,
      incidentId,
      principal,
      () => this.stateMachine.nextOnArchive(),
      async (tx) => {
        await tx
          .update(nerisIncidents)
          .set({ archivedAt: new Date(), archivedByUserId: principal.userId })
          .where(eq(nerisIncidents.id, incidentId));
      },
    );
  }

  async getFormDescriptor(tenantId: string, incidentId: string) {
    const specialtyEnabled = await this.access.isSpecialtyWorkflowsEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      const valueRows = await tx
        .select({
          fieldKey: nerisFields.fieldKey,
          valueText: nerisIncidentFieldValues.valueText,
          valueNumber: nerisIncidentFieldValues.valueNumber,
          valueBoolean: nerisIncidentFieldValues.valueBoolean,
          valueJson: nerisIncidentFieldValues.valueJson,
        })
        .from(nerisIncidentFieldValues)
        .innerJoin(nerisFields, eq(nerisIncidentFieldValues.fieldId, nerisFields.id))
        .where(eq(nerisIncidentFieldValues.incidentId, incidentId));

      const fieldValuesByKey: Record<string, unknown> = {};
      for (const row of valueRows) {
        fieldValuesByKey[row.fieldKey] =
          row.valueJson ?? row.valueText ?? row.valueNumber ?? row.valueBoolean ?? null;
      }

      const sections = await tx.query.nerisIncidentSections.findMany({
        where: eq(nerisIncidentSections.incidentId, incidentId),
      });
      const notApplicableSectionKeys = sections
        .filter((s) => s.status === "NOT_APPLICABLE")
        .map((s) => s.sectionKey);
      const core = new Set<string>(DEFAULT_INCIDENT_SECTIONS);
      const forcedActiveSectionKeys = sections
        .filter(
          (s) =>
            !core.has(s.sectionKey) &&
            (s.status === "ACTIVE" ||
              s.status === "IN_PROGRESS" ||
              s.status === "INCOMPLETE" ||
              s.status === "COMPLETE"),
        )
        .map((s) => s.sectionKey);

      const secondary = Array.isArray(incident.secondaryIncidentTypeCodes)
        ? incident.secondaryIncidentTypeCodes.filter((v): v is string => Boolean(v))
        : [];

      return this.formDescriptor.compose(tenantId, {
        ...(incident.schemaVersionId ? { schemaVersionId: incident.schemaVersionId } : {}),
        fieldValuesByKey,
        classificationSignals: [incident.primaryIncidentTypeCode, ...secondary].filter(
          (v): v is string => Boolean(v),
        ),
        notApplicableSectionKeys,
        forcedActiveSectionKeys,
        specialtyWorkflowsEnabled: specialtyEnabled,
      });
    });
  }

  /**
   * Activate an optional specialty section or mark an optional section not applicable.
   * Never silently deletes field values — N/A only changes section status.
   */
  async updateSpecialtySection(
    tenantId: string,
    incidentId: string,
    principal: ForgePrincipal,
    input: {
      sectionKey: string;
      action: "ACTIVATE" | "MARK_NOT_APPLICABLE" | "CLEAR_NOT_APPLICABLE";
    },
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const sectionKey = input.sectionKey.trim().toUpperCase();
    if ((DEFAULT_INCIDENT_SECTIONS as readonly string[]).includes(sectionKey)) {
      throw new ForgeError(
        "BAD_REQUEST",
        "Core sections cannot be activated or marked N/A this way",
      );
    }
    const definition = SPECIALTY_WORKFLOW_GROUPS.find((g) => g.sectionKey === sectionKey);
    if (!definition) {
      throw new ForgeError("BAD_REQUEST", `Unknown specialty section: ${sectionKey}`);
    }
    if (input.action === "MARK_NOT_APPLICABLE" && !definition.allowNotApplicable) {
      throw new ForgeError("BAD_REQUEST", `Section ${sectionKey} cannot be marked not applicable`);
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentSections.findFirst({
        where: and(
          eq(nerisIncidentSections.incidentId, incidentId),
          eq(nerisIncidentSections.sectionKey, sectionKey),
        ),
      });

      let status = "INCOMPLETE";
      if (input.action === "MARK_NOT_APPLICABLE") status = "NOT_APPLICABLE";
      if (input.action === "ACTIVATE" || input.action === "CLEAR_NOT_APPLICABLE") {
        status = "INCOMPLETE";
      }

      if (existing) {
        await tx
          .update(nerisIncidentSections)
          .set({ status, updatedAt: new Date() })
          .where(eq(nerisIncidentSections.id, existing.id));
      } else {
        await tx.insert(nerisIncidentSections).values({
          id: createId(),
          tenantId,
          incidentId,
          sectionKey,
          status,
        });
      }

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "neris.incident.specialty_section.update",
        resourceType: "neris_incident_section",
        resourceId: incidentId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { sectionKey, action: input.action, status },
      });

      return { incidentId, sectionKey, status };
    });
  }

  async checkDuplicates(tenantId: string, input: unknown, excludeIncidentId?: string) {
    const data = duplicateCheckInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const findings = await this.validation.checkDuplicates(tx, tenantId, {
        ...(data.incidentNumber ? { incidentNumber: data.incidentNumber } : {}),
        ...(data.incidentDate ? { incidentDate: data.incidentDate } : {}),
        ...(data.dispatchDescription ? { dispatchDescription: data.dispatchDescription } : {}),
        ...(excludeIncidentId ? { excludeIncidentId } : {}),
      });
      return { findings, hasBlocking: findings.some((f) => f.severity === "BLOCKING_ERROR") };
    });
  }

  async getNarrative(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const row = await tx.query.nerisIncidentNarratives.findFirst({
        where: eq(nerisIncidentNarratives.incidentId, incidentId),
      });
      return row ?? { incidentId, body: "", characterCount: 0 };
    });
  }

  async upsertNarrative(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertIncidentShellEnabled(principal);
    const data = upsertNarrativeInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const incident = await this.requireIncident(tx, tenantId, incidentId);
        this.stateMachine.assertEditable(incident.status as NerisIncidentStatus);
        if (expected !== "*" && incident.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident",
            resourceId: incidentId,
            expectedVersion: expected,
            actualVersion: incident.recordVersion,
          });
        }

        const now = new Date();
        const existing = await tx.query.nerisIncidentNarratives.findFirst({
          where: eq(nerisIncidentNarratives.incidentId, incidentId),
        });

        let narrative = existing;
        if (existing) {
          [narrative] = await tx
            .update(nerisIncidentNarratives)
            .set({
              body: data.body,
              characterCount: data.body.length,
              templateKey: data.templateKey,
              recordVersion: existing.recordVersion + 1,
              updatedByUserId: principal.userId,
              updatedAt: now,
            })
            .where(eq(nerisIncidentNarratives.id, existing.id))
            .returning();
        } else {
          [narrative] = await tx
            .insert(nerisIncidentNarratives)
            .values({
              id: createId(),
              tenantId,
              incidentId,
              body: data.body,
              characterCount: data.body.length,
              templateKey: data.templateKey,
              createdByUserId: principal.userId,
              updatedByUserId: principal.userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }

        if (narrative) {
          const versionRows = await tx
            .select({ max: count() })
            .from(nerisIncidentNarrativeVersions)
            .where(eq(nerisIncidentNarrativeVersions.narrativeId, narrative.id));
          const versionNumber = (versionRows[0]?.max ?? 0) + 1;
          await tx.insert(nerisIncidentNarrativeVersions).values({
            id: createId(),
            tenantId,
            narrativeId: narrative.id,
            incidentId,
            body: data.body,
            characterCount: data.body.length,
            versionNumber,
            createdByUserId: principal.userId,
            createdAt: now,
          });
        }

        const newStatus = this.stateMachine.promoteDraftIfNeeded(
          incident.status as NerisIncidentStatus,
        );
        await tx
          .update(nerisIncidents)
          .set({
            status: newStatus,
            recordVersion: incident.recordVersion + 1,
            updatedByUserId: principal.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(nerisIncidents.id, incidentId),
              eq(nerisIncidents.recordVersion, incident.recordVersion),
            ),
          );

        return narrative;
      },
      principal.userId,
    );
  }

  async listStatusHistory(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentStatusHistory.findMany({
        where: eq(nerisIncidentStatusHistory.incidentId, incidentId),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      });
    });
  }

  async listReviewComments(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentReviewComments.findMany({
        where: eq(nerisIncidentReviewComments.incidentId, incidentId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    });
  }

  private async assertReviewWorkflowAccess(principal: ForgePrincipal): Promise<void> {
    await this.access.assertIncidentShellEnabled(principal);
    if (hasPermission(principal, "rms.neris.specialty.review")) {
      await this.access.assertSpecialtyWorkflowsEnabled(principal);
      return;
    }
    await this.access.assertOfficerReviewEnabled(principal);
  }

  async addReviewComment(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertReviewWorkflowAccess(principal);
    const data = reviewCommentInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireIncident(tx, tenantId, incidentId);
        const [row] = await tx
          .insert(nerisIncidentReviewComments)
          .values({
            id: createId(),
            tenantId,
            incidentId,
            sectionKey: data.sectionKey ?? null,
            fieldId: data.fieldId ?? null,
            specialtyRecordType: data.specialtyRecordType ?? null,
            specialtyRecordId: data.specialtyRecordId ?? null,
            attachmentId: data.attachmentId ?? null,
            validationResultId: data.validationResultId ?? null,
            reviewerRole: data.reviewerRole ?? null,
            assignedToUserId: data.assignedToUserId ?? null,
            status: "OPEN",
            body: data.body,
            authorUserId: principal.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "neris.review_comment.create",
          resourceType: "neris_incident_review_comment",
          resourceId: row!.id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: {
            incidentId,
            sectionKey: data.sectionKey,
            specialtyRecordType: data.specialtyRecordType,
            attachmentId: data.attachmentId,
            reviewerRole: data.reviewerRole,
          },
        });
        return row;
      },
      principal.userId,
    );
  }

  async resolveReviewComment(
    tenantId: string,
    incidentId: string,
    commentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertReviewWorkflowAccess(principal);
    const data = resolveReviewCommentInputSchema.parse(input ?? {});
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireIncident(tx, tenantId, incidentId);
        const existing = await tx.query.nerisIncidentReviewComments.findFirst({
          where: and(
            eq(nerisIncidentReviewComments.id, commentId),
            eq(nerisIncidentReviewComments.incidentId, incidentId),
          ),
        });
        if (!existing) throw new ForgeError("NOT_FOUND", "Review comment not found");
        const [row] = await tx
          .update(nerisIncidentReviewComments)
          .set({
            status: "RESOLVED",
            resolutionNote: data.resolutionNote ?? null,
            resolvedAt: new Date(),
            resolvedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidentReviewComments.id, commentId))
          .returning();
        return row;
      },
      principal.userId,
    );
  }

  async reopenReviewComment(
    tenantId: string,
    incidentId: string,
    commentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertReviewWorkflowAccess(principal);
    const data = reopenReviewCommentInputSchema.parse(input ?? {});
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireIncident(tx, tenantId, incidentId);
        const existing = await tx.query.nerisIncidentReviewComments.findFirst({
          where: and(
            eq(nerisIncidentReviewComments.id, commentId),
            eq(nerisIncidentReviewComments.incidentId, incidentId),
          ),
        });
        if (!existing) throw new ForgeError("NOT_FOUND", "Review comment not found");
        const [row] = await tx
          .update(nerisIncidentReviewComments)
          .set({
            status: "OPEN",
            resolutionNote: data.note ?? existing.resolutionNote,
            resolvedAt: null,
            resolvedByUserId: null,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidentReviewComments.id, commentId))
          .returning();
        return row;
      },
      principal.userId,
    );
  }

  async getSchemaSnapshot(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const row = await tx.query.nerisIncidentSchemaSnapshots.findFirst({
        where: eq(nerisIncidentSchemaSnapshots.incidentId, incidentId),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Schema snapshot not found");
      return row;
    });
  }

  async listConfigurationSnapshots(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentConfigurationSnapshots.findMany({
        where: eq(nerisIncidentConfigurationSnapshots.incidentId, incidentId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    });
  }

  async listValidationRuns(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const runs = await tx.query.nerisIncidentValidationRuns.findMany({
        where: eq(nerisIncidentValidationRuns.incidentId, incidentId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return runs;
    });
  }

  async getValidationRun(tenantId: string, incidentId: string, runId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const run = await tx.query.nerisIncidentValidationRuns.findFirst({
        where: and(
          eq(nerisIncidentValidationRuns.id, runId),
          eq(nerisIncidentValidationRuns.incidentId, incidentId),
        ),
      });
      if (!run) throw new ForgeError("NOT_FOUND", "Validation run not found");
      const results = await tx.query.nerisIncidentValidationResults.findMany({
        where: eq(nerisIncidentValidationResults.runId, runId),
      });
      return { run, results };
    });
  }

  private async transition(
    tenantId: string,
    incidentId: string,
    principal: ForgePrincipal,
    nextStatus: (from: NerisIncidentStatus) => NerisIncidentStatus,
    sideEffect: (
      tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
      incident: typeof nerisIncidents.$inferSelect,
    ) => Promise<void>,
    reason?: string,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await this.requireIncident(tx, tenantId, incidentId);
        const from = before.status as NerisIncidentStatus;
        const to = nextStatus(from);

        // Submit from IN_PROGRESS passes through READY_FOR_REVIEW (plan state
        // machine: blocking errors gate READY_FOR_REVIEW; submit gate re-checks).
        const path: NerisIncidentStatus[] =
          from === "IN_PROGRESS" && to === "SUBMITTED_FOR_REVIEW"
            ? ["READY_FOR_REVIEW", "SUBMITTED_FOR_REVIEW"]
            : [to];
        let hopFrom = from;
        for (const hop of path) {
          this.stateMachine.assertTransition(hopFrom, hop, principal);
          hopFrom = hop;
        }

        const [updated] = await tx
          .update(nerisIncidents)
          .set({
            status: to,
            recordVersion: before.recordVersion + 1,
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
            submittedAt: to === "SUBMITTED_FOR_REVIEW" ? new Date() : before.submittedAt,
          })
          .where(
            and(
              eq(nerisIncidents.id, incidentId),
              eq(nerisIncidents.recordVersion, before.recordVersion),
            ),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident",
            resourceId: incidentId,
            expectedVersion: before.recordVersion,
            actualVersion: null,
          });
        }

        let historyFrom = from;
        for (const hop of path) {
          await this.recordStatusChange(
            tx,
            tenantId,
            incidentId,
            historyFrom,
            hop,
            principal,
            reason,
          );
          historyFrom = hop;
        }
        await sideEffect(tx, updated);
        await this.emitIncidentEvent(
          tx,
          tenantId,
          incidentId,
          DOMAIN_EVENT_TYPES.NERIS_INCIDENT_STATUS_CHANGED,
          principal,
          { from, to },
        );
        return updated;
      },
      principal.userId,
    );
  }

  private async requireIncident(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
  ) {
    const [row] = await tx
      .select()
      .from(nerisIncidents)
      .where(
        and(
          eq(nerisIncidents.id, incidentId),
          eq(nerisIncidents.tenantId, tenantId),
          isNull(nerisIncidents.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "Incident not found");
    return row;
  }

  private async versionedUpdate(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
    before: typeof nerisIncidents.$inferSelect,
    patch: Record<string, unknown>,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const version = before.recordVersion;
    if (expected !== "*" && version !== expected) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "neris_incident",
        resourceId: incidentId,
        expectedVersion: expected,
        actualVersion: version,
      });
    }
    const [updated] = await tx
      .update(nerisIncidents)
      .set({ ...patch, recordVersion: version + 1, updatedAt: new Date() })
      .where(and(eq(nerisIncidents.id, incidentId), eq(nerisIncidents.recordVersion, version)))
      .returning();
    if (!updated) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "neris_incident",
        resourceId: incidentId,
        expectedVersion: expected,
        actualVersion: null,
      });
    }
    await this.emitIncidentEvent(
      tx,
      tenantId,
      incidentId,
      DOMAIN_EVENT_TYPES.NERIS_INCIDENT_STATUS_CHANGED,
      principal,
      { action: "patch" },
    );
    return updated;
  }

  private async recordStatusChange(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
    fromStatus: string | null,
    toStatus: string,
    principal: ForgePrincipal,
    reason?: string,
  ) {
    await tx.insert(nerisIncidentStatusHistory).values({
      id: createId(),
      tenantId,
      incidentId,
      fromStatus,
      toStatus,
      reason,
      actorUserId: principal.userId,
      createdAt: new Date(),
    });
    await tx.insert(nerisIncidentActivity).values({
      id: createId(),
      tenantId,
      incidentId,
      activityType: "STATUS_CHANGED",
      summary: `Status changed from ${fromStatus ?? "NONE"} to ${toStatus}`,
      detailsJson: { fromStatus, toStatus, reason },
      actorUserId: principal.userId,
      createdAt: new Date(),
    });
  }

  private async writeConfigurationSnapshot(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
    trigger: string,
    principal: ForgePrincipal,
  ) {
    const snapshot = await this.formDescriptor.buildConfigurationSnapshot(tenantId);
    await tx.insert(nerisIncidentConfigurationSnapshots).values({
      id: createId(),
      tenantId,
      incidentId,
      trigger,
      snapshotJson: snapshot,
      createdByUserId: principal.userId,
      createdAt: new Date(),
    });
  }

  private async emitIncidentEvent(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
    eventType: string,
    principal: ForgePrincipal,
    payload: Record<string, unknown>,
  ) {
    await this.outbox.write(tx, {
      tenantId,
      aggregateType: "neris_incident",
      aggregateId: incidentId,
      eventType,
      payload: { tenantId, incidentId, ...payload },
      correlationId: principal.correlationId,
      actorUserId: principal.userId,
    });
  }
}
