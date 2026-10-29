import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { CadNormalizedEvent } from "@forge/cad-contracts";
import { decideFieldOwnership, decideOutOfOrderAction, evaluateCadMatch } from "@forge/cad-core";
import {
  auditEvents,
  cadConflicts,
  cadConnections,
  cadFieldProvenance,
  cadIncidentLinks,
  cadNormalizedEvents,
  cadRawMessages,
  createId,
  getSharedDatabase,
  nerisIncidentAddresses,
  nerisIncidentLocations,
  nerisIncidentNumberConfigs,
  nerisIncidentNumbers,
  nerisIncidentNumberSequences,
  nerisIncidents,
  nerisIncidentSchemaSnapshots,
  nerisIncidentSections,
  nerisIncidentStatusHistory,
  nerisSchemaVersions,
  tenantNerisConfiguration,
  withTenantTransaction,
} from "@forge/database";
import { createLogger } from "@forge/observability";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

export type CadMatchJob = {
  type: "cad.normalized.ready.v1";
  tenantId: string;
  connectionId: string;
  rawMessageId: string;
  normalizedEventId: string;
  correlationId: string;
};

const DEFAULT_SECTIONS = [
  "DISPATCH",
  "LOCATION",
  "TIMES",
  "UNITS",
  "PERSONNEL",
  "ACTIONS",
  "NARRATIVE",
  "REVIEW",
];

export async function processCadMatchJob(input: {
  job: CadMatchJob;
  databaseUrl: string;
  region: string;
  applicationQueueUrl?: string;
}): Promise<"completed" | "failed"> {
  const logger = createLogger({
    service: "worker-service",
    environment: process.env.APP_ENV ?? "local",
  }).child({ correlationId: input.job.correlationId });

  const db = getSharedDatabase(input.databaseUrl);
  const sqs = new SQSClient({ region: input.region });

  try {
    await withTenantTransaction(db, input.job.tenantId, async (tx) => {
      const normalized = await tx.query.cadNormalizedEvents.findFirst({
        where: eq(cadNormalizedEvents.id, input.job.normalizedEventId),
      });
      if (!normalized) throw new Error("normalized event not found");

      const raw = await tx.query.cadRawMessages.findFirst({
        where: eq(cadRawMessages.id, input.job.rawMessageId),
      });
      if (!raw) throw new Error("raw message not found");

      const connection = await tx.query.cadConnections.findFirst({
        where: eq(cadConnections.id, input.job.connectionId),
      });
      if (!connection) throw new Error("connection not found");

      const tenantConfig = await tx.query.tenantNerisConfiguration.findFirst({
        where: eq(tenantNerisConfiguration.tenantId, input.job.tenantId),
      });

      const intakeMode = connection.intakeMode || tenantConfig?.operatingMode || "MANUAL_ONLY";
      const event = normalized.normalizedPayload as unknown as CadNormalizedEvent;

      await tx
        .update(cadRawMessages)
        .set({ processingStatus: "MATCHING", currentProcessingStage: "MATCHING" })
        .where(eq(cadRawMessages.id, raw.id));

      // Exact link candidates
      const existingLinks = event.source.incidentId
        ? await tx.query.cadIncidentLinks.findMany({
            where: and(
              eq(cadIncidentLinks.tenantId, input.job.tenantId),
              eq(cadIncidentLinks.cadConnectionId, input.job.connectionId),
              eq(cadIncidentLinks.sourceIncidentId, event.source.incidentId),
              inArray(cadIncidentLinks.linkStatus, ["ACTIVE", "SUSPENDED", "CONFLICT"]),
            ),
          })
        : [];

      const dayStart = event.source.timestamp.slice(0, 10);
      const windowStart = new Date(Date.parse(event.source.timestamp) - 2 * 60 * 60 * 1000);

      const recentIncidents = await tx
        .select()
        .from(nerisIncidents)
        .where(
          and(
            eq(nerisIncidents.tenantId, input.job.tenantId),
            isNull(nerisIncidents.deletedAt),
            gte(nerisIncidents.createdAt, windowStart),
          ),
        )
        .orderBy(desc(nerisIncidents.createdAt))
        .limit(50);

      const addresses = recentIncidents.length
        ? await tx
            .select()
            .from(nerisIncidentAddresses)
            .where(
              and(
                eq(nerisIncidentAddresses.tenantId, input.job.tenantId),
                inArray(
                  nerisIncidentAddresses.incidentId,
                  recentIncidents.map((i) => i.id),
                ),
              ),
            )
        : [];

      const locations = recentIncidents.length
        ? await tx
            .select()
            .from(nerisIncidentLocations)
            .where(
              and(
                eq(nerisIncidentLocations.tenantId, input.job.tenantId),
                inArray(
                  nerisIncidentLocations.incidentId,
                  recentIncidents.map((i) => i.id),
                ),
              ),
            )
        : [];

      const addressByIncident = new Map(addresses.map((a) => [a.incidentId, a]));
      const locationByIncident = new Map(locations.map((l) => [l.incidentId, l]));

      const candidates = [
        ...existingLinks.map((link) => ({
          incidentId: link.incidentId,
          existingSourceIncidentId: link.sourceIncidentId,
          existingLinkConnectionId: link.cadConnectionId,
        })),
        ...recentIncidents.map((inc) => {
          const addr = addressByIncident.get(inc.id);
          const loc = locationByIncident.get(inc.id);
          return {
            incidentId: inc.id,
            incidentNumber: inc.incidentNumber,
            incidentDate: inc.incidentDate,
            status: inc.status,
            primaryIncidentTypeCode: inc.primaryIncidentTypeCode,
            dispatchDescription: inc.dispatchDescription,
            fullAddress: addr
              ? [addr.addressLine1, addr.city, addr.state].filter(Boolean).join(" ")
              : null,
            latitude: loc?.latitude ?? null,
            longitude: loc?.longitude ?? null,
            alarmAt: inc.alarmAt?.toISOString() ?? null,
          };
        }),
      ];

      // Dedupe by incidentId preferring linked entries
      const byId = new Map<string, (typeof candidates)[number]>();
      for (const c of candidates) {
        const prev = byId.get(c.incidentId);
        if (!prev || ("existingSourceIncidentId" in c && c.existingSourceIncidentId)) {
          byId.set(c.incidentId, c);
        }
      }

      const decision = evaluateCadMatch({
        event,
        connectionId: input.job.connectionId,
        candidates: [...byId.values()],
        hybridMode: intakeMode === "HYBRID",
        thresholds: {
          automaticMatchThreshold: tenantConfig?.autoLinkThreshold ?? 90,
          possibleDuplicateThreshold: tenantConfig?.possibleDuplicateThreshold ?? 70,
          timeWindowMinutes: 30,
          coordinateRadiusMeters: 150,
          normalizedAddressWeight: 1,
          unitOverlapWeight: 1,
          callTypeWeight: 1,
        },
      });

      if (intakeMode === "MANUAL_ONLY" && decision.outcome === "CREATE_NEW") {
        await createConflict(tx, {
          tenantId: input.job.tenantId,
          connectionId: input.job.connectionId,
          rawMessageId: raw.id,
          normalizedEventId: normalized.id,
          conflictType: "AMBIGUOUS_MATCH",
          recommendedResolution: "IGNORE",
          cadValueJson: { reason: "MANUAL_ONLY_blocks_create", decision },
          matchScore: decision.score,
          candidateIncidentIds: decision.candidateIncidentIds,
        });
        await tx
          .update(cadRawMessages)
          .set({ processingStatus: "REQUIRES_REVIEW", currentProcessingStage: "MATCHING" })
          .where(eq(cadRawMessages.id, raw.id));
        await tx
          .update(cadNormalizedEvents)
          .set({ incidentApplicationStatus: "REQUIRES_REVIEW" })
          .where(eq(cadNormalizedEvents.id, normalized.id));
        return;
      }

      if (
        decision.outcome === "POSSIBLE_DUPLICATE" ||
        decision.outcome === "REQUIRES_REVIEW" ||
        decision.outcome === "REJECT"
      ) {
        const conflictInput: Parameters<typeof createConflict>[1] = {
          tenantId: input.job.tenantId,
          connectionId: input.job.connectionId,
          rawMessageId: raw.id,
          normalizedEventId: normalized.id,
          conflictType:
            decision.outcome === "POSSIBLE_DUPLICATE" ? "DUPLICATE_INCIDENT" : "AMBIGUOUS_MATCH",
          recommendedResolution: decision.outcome === "POSSIBLE_DUPLICATE" ? "LINK" : "CREATE_NEW",
          cadValueJson: { decision },
          matchScore: decision.score,
          candidateIncidentIds: decision.candidateIncidentIds,
        };
        if (decision.candidateIncidentIds[0]) {
          conflictInput.incidentId = decision.candidateIncidentIds[0];
        }
        await createConflict(tx, conflictInput);
        await tx
          .update(cadRawMessages)
          .set({ processingStatus: "REQUIRES_REVIEW", currentProcessingStage: "MATCHING" })
          .where(eq(cadRawMessages.id, raw.id));
        await tx
          .update(cadNormalizedEvents)
          .set({ incidentApplicationStatus: "REQUIRES_REVIEW" })
          .where(eq(cadNormalizedEvents.id, normalized.id));
        return;
      }

      let incidentId = decision.candidateIncidentIds[0];
      let linkId: string | undefined;

      if (decision.outcome === "CREATE_NEW") {
        incidentId = await createCadIncidentShell(tx, {
          tenantId: input.job.tenantId,
          event,
          intakeMode,
          correlationId: input.job.correlationId,
        });
        linkId = await upsertLink(tx, {
          tenantId: input.job.tenantId,
          incidentId,
          connectionId: input.job.connectionId,
          event,
          method: "AUTOMATIC",
          score: decision.score,
          details: decision,
          cutoffPolicy: tenantConfig?.cadUpdateCutoffPolicy ?? "UNTIL_FINALIZED",
        });
      } else if (decision.outcome === "UPDATE_EXISTING" || decision.outcome === "LINK_TO_MANUAL") {
        if (!incidentId) throw new Error("missing candidate for update/link");
        const incident = await tx.query.nerisIncidents.findFirst({
          where: eq(nerisIncidents.id, incidentId),
        });
        if (!incident) throw new Error("candidate incident missing");

        if (incident.status === "FINALIZED") {
          const hasCallType = Boolean(event.incident.callType);
          await createConflict(tx, {
            tenantId: input.job.tenantId,
            connectionId: input.job.connectionId,
            rawMessageId: raw.id,
            normalizedEventId: normalized.id,
            incidentId,
            conflictType: "FINALIZED_RECORD_CONFLICT",
            fieldIdentifier: hasCallType ? "incident.primaryIncidentTypeCode" : "incident.status",
            ownershipPolicy: "CAD_UNTIL_MANUAL_EDIT",
            recommendedResolution: "KEEP_FORGE",
            cadValueJson: hasCallType ? event.incident.callType : { eventType: event.eventType },
            forgeValueJson: hasCallType
              ? incident.primaryIncidentTypeCode
              : { status: incident.status },
          });
          await tx
            .update(cadRawMessages)
            .set({ processingStatus: "REQUIRES_REVIEW", currentProcessingStage: "MATCHING" })
            .where(eq(cadRawMessages.id, raw.id));
          return;
        }

        const existingLink = await tx.query.cadIncidentLinks.findFirst({
          where: and(
            eq(cadIncidentLinks.tenantId, input.job.tenantId),
            eq(cadIncidentLinks.cadConnectionId, input.job.connectionId),
            eq(cadIncidentLinks.incidentId, incidentId),
            inArray(cadIncidentLinks.linkStatus, ["ACTIVE", "SUSPENDED"]),
          ),
        });

        if (existingLink) {
          const ooo = decideOutOfOrderAction({
            incomingSequence: event.source.sequence ?? null,
            lastAppliedSequence: existingLink.lastCadSequence ?? null,
            incomingTimestamp: event.source.timestamp,
            lastAppliedTimestamp: existingLink.lastCadUpdateAt?.toISOString() ?? null,
            containsNewInformation: Boolean(event.location || event.incident.callType),
          });
          if (ooo === "REJECT_STALE") {
            await tx
              .update(cadRawMessages)
              .set({
                processingStatus: "DUPLICATE",
                currentProcessingStage: "MATCHING",
                lastProcessingErrorCode: "STALE_EVENT",
                lastProcessingErrorSummary: "Stale out-of-order event preserved only",
              })
              .where(eq(cadRawMessages.id, raw.id));
            return;
          }
          if (ooo === "REQUIRES_REVIEW" || ooo === "APPLY_WITH_WARNING") {
            await createConflict(tx, {
              tenantId: input.job.tenantId,
              connectionId: input.job.connectionId,
              rawMessageId: raw.id,
              normalizedEventId: normalized.id,
              incidentId,
              conflictType: "OUT_OF_ORDER_EVENT",
              recommendedResolution: "USE_CAD",
              cadValueJson: { sequence: event.source.sequence, action: ooo },
            });
          }
          linkId = existingLink.id;
        } else {
          linkId = await upsertLink(tx, {
            tenantId: input.job.tenantId,
            incidentId,
            connectionId: input.job.connectionId,
            event,
            method: decision.outcome === "LINK_TO_MANUAL" ? "HYBRID_MATCH" : "AUTOMATIC",
            score: decision.score,
            details: decision,
            cutoffPolicy: tenantConfig?.cadUpdateCutoffPolicy ?? "UNTIL_FINALIZED",
          });
        }
      }

      if (!incidentId) throw new Error("no incident resolved");

      await applyCadValues(tx, {
        tenantId: input.job.tenantId,
        incidentId,
        connectionId: input.job.connectionId,
        rawMessageId: raw.id,
        normalizedEventId: normalized.id,
        event,
        createMode: decision.outcome === "CREATE_NEW",
      });

      if (linkId) {
        await tx
          .update(cadIncidentLinks)
          .set({
            lastCadSequence: event.source.sequence ?? null,
            lastCadUpdateAt: new Date(event.source.timestamp),
            updatedAt: new Date(),
          })
          .where(eq(cadIncidentLinks.id, linkId));
      }

      await tx
        .update(cadRawMessages)
        .set({
          processingStatus: "APPLIED",
          currentProcessingStage: "APPLICATION",
          appliedAt: new Date(),
        })
        .where(eq(cadRawMessages.id, raw.id));
      await tx
        .update(cadNormalizedEvents)
        .set({ incidentApplicationStatus: "APPLIED" })
        .where(eq(cadNormalizedEvents.id, normalized.id));

      await tx.insert(auditEvents).values({
        id: createId(),
        tenantId: input.job.tenantId,
        actorUserId: null,
        actorPersonId: null,
        actorType: "SYSTEM",
        action: decision.outcome === "CREATE_NEW" ? "CAD_INCIDENT_CREATED" : "CAD_EVENT_APPLIED",
        resourceType: "neris_incident",
        resourceId: incidentId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: input.job.correlationId,
        requestId: input.job.correlationId,
        metadataJson: {
          outcome: decision.outcome,
          rawMessageId: raw.id,
          normalizedEventId: normalized.id,
        },
        occurredAt: new Date(),
      });

      logger.info("cad event applied", {
        incidentId,
        outcome: decision.outcome,
        dayStart,
      });

      if (input.applicationQueueUrl) {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: input.applicationQueueUrl,
            MessageBody: JSON.stringify({
              type: "cad.application.completed.v1",
              tenantId: input.job.tenantId,
              incidentId,
              normalizedEventId: normalized.id,
              correlationId: input.job.correlationId,
            }),
          }),
        );
      }
    });

    return "completed";
  } catch (error) {
    logger.error("cad match/application failed", { error });
    return "failed";
  }
}

async function createCadIncidentShell(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  input: {
    tenantId: string;
    event: CadNormalizedEvent;
    intakeMode: string;
    correlationId: string;
  },
): Promise<string> {
  const published = await tx.query.nerisSchemaVersions.findFirst({
    where: eq(nerisSchemaVersions.state, "PUBLISHED"),
  });
  if (!published) throw new Error("no published NERIS schema");

  const incidentDate = input.event.source.timestamp.slice(0, 10);
  const { number, ledgerId } = await claimNumber(tx, input.tenantId, new Date(incidentDate));
  const id = createId();
  const now = new Date();

  await tx.insert(nerisIncidents).values({
    id,
    tenantId: input.tenantId,
    incidentNumber: number,
    status: "DRAFT",
    schemaVersionId: published.id,
    incidentDate,
    alarmAt: input.event.timestamps?.dispatch
      ? new Date(input.event.timestamps.dispatch)
      : new Date(input.event.source.timestamp),
    incidentSource: "CAD",
    dispatchDescription: input.event.incident.nature ?? input.event.incident.callType ?? null,
    primaryIncidentTypeCode: input.event.incident.callType ?? null,
    operatingMode: input.intakeMode,
    createdAt: now,
    updatedAt: now,
  });

  await tx
    .update(nerisIncidentNumbers)
    .set({ incidentId: id })
    .where(eq(nerisIncidentNumbers.id, ledgerId));

  await tx.insert(nerisIncidentSections).values(
    DEFAULT_SECTIONS.map((sectionKey) => ({
      id: createId(),
      tenantId: input.tenantId,
      incidentId: id,
      sectionKey,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await tx.insert(nerisIncidentSchemaSnapshots).values({
    id: createId(),
    tenantId: input.tenantId,
    incidentId: id,
    schemaVersionId: published.id,
    checksumSha256: createHash("sha256").update(published.id).digest("hex"),
    snapshotJson: { source: "CAD", schemaVersionId: published.id },
    createdAt: now,
  });

  await tx.insert(nerisIncidentStatusHistory).values({
    id: createId(),
    tenantId: input.tenantId,
    incidentId: id,
    fromStatus: null,
    toStatus: "DRAFT",
    actorUserId: null,
    createdAt: now,
  });

  if (input.event.location?.fullAddress) {
    await tx.insert(nerisIncidentAddresses).values({
      id: createId(),
      tenantId: input.tenantId,
      incidentId: id,
      addressLine1: input.event.location.fullAddress,
      city: input.event.location.city ?? null,
      state: input.event.location.state ?? null,
      postalCode: input.event.location.postalCode ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (input.event.location?.latitude != null || input.event.location?.longitude != null) {
    await tx.insert(nerisIncidentLocations).values({
      id: createId(),
      tenantId: input.tenantId,
      incidentId: id,
      latitude: input.event.location.latitude ?? null,
      longitude: input.event.location.longitude ?? null,
      locationDescription: input.event.location.fullAddress ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  void input.correlationId;
  return id;
}

async function claimNumber(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  incidentDate: Date,
): Promise<{ number: string; ledgerId: string }> {
  let config = await tx.query.nerisIncidentNumberConfigs.findFirst({
    where: and(
      eq(nerisIncidentNumberConfigs.tenantId, tenantId),
      eq(nerisIncidentNumberConfigs.name, "DEFAULT"),
    ),
  });
  if (!config) {
    const [created] = await tx
      .insert(nerisIncidentNumberConfigs)
      .values({
        id: createId(),
        tenantId,
        name: "DEFAULT",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    config = created!;
  }

  const periodKey = String(incidentDate.getUTCFullYear());
  const locked = await tx.execute(sql`
    SELECT id, next_value
    FROM neris_incident_number_sequences
    WHERE config_id = ${config.id}
      AND period_key = ${periodKey}
      AND station_id IS NULL
      AND category_key IS NULL
    FOR UPDATE
  `);
  const rows = locked as unknown as Array<{ id: string; next_value: number }>;
  let seqValue: number;
  if (rows.length === 0) {
    seqValue = 1;
    await tx.insert(nerisIncidentNumberSequences).values({
      id: createId(),
      tenantId,
      configId: config.id,
      periodKey,
      nextValue: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    seqValue = rows[0]!.next_value;
    await tx
      .update(nerisIncidentNumberSequences)
      .set({ nextValue: seqValue + 1, updatedAt: new Date() })
      .where(eq(nerisIncidentNumberSequences.id, rows[0]!.id));
  }

  const number = `${periodKey}-${String(seqValue).padStart(6, "0")}`;
  const ledgerId = createId();
  await tx.insert(nerisIncidentNumbers).values({
    id: ledgerId,
    tenantId,
    number,
    status: "ASSIGNED",
    source: "AUTO",
    sequenceValue: seqValue,
    periodKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { number, ledgerId };
}

async function upsertLink(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  input: {
    tenantId: string;
    incidentId: string;
    connectionId: string;
    event: CadNormalizedEvent;
    method: string;
    score: number;
    details: unknown;
    cutoffPolicy: string;
  },
): Promise<string> {
  if (!input.event.source.incidentId) {
    throw new Error("source incident id required for link");
  }
  const id = createId();
  await tx.insert(cadIncidentLinks).values({
    id,
    tenantId: input.tenantId,
    incidentId: input.incidentId,
    cadConnectionId: input.connectionId,
    sourceIncidentId: input.event.source.incidentId,
    sourceIncidentNumber: input.event.source.incidentNumber ?? null,
    sourceEventId: input.event.source.eventId ?? null,
    linkStatus: "ACTIVE",
    linkMethod: input.method,
    matchScore: input.score,
    matchDetailsJson: input.details as Record<string, unknown>,
    cadUpdateCutoffPolicy: input.cutoffPolicy,
    lastCadSequence: input.event.source.sequence ?? null,
    lastCadUpdateAt: new Date(input.event.source.timestamp),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function applyCadValues(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  input: {
    tenantId: string;
    incidentId: string;
    connectionId: string;
    rawMessageId: string;
    normalizedEventId: string;
    event: CadNormalizedEvent;
    createMode: boolean;
  },
): Promise<void> {
  const incident = await tx.query.nerisIncidents.findFirst({
    where: eq(nerisIncidents.id, input.incidentId),
  });
  if (!incident) throw new Error("incident missing for apply");

  const fields: Array<{
    fieldIdentifier: string;
    ownershipPolicy: string;
    apply: () => Promise<void>;
    cadValue: unknown;
    forgeValue: unknown;
  }> = [];

  if (input.event.incident.callType) {
    fields.push({
      fieldIdentifier: "incident.primaryIncidentTypeCode",
      ownershipPolicy: "CAD_UNTIL_MANUAL_EDIT",
      cadValue: input.event.incident.callType,
      forgeValue: incident.primaryIncidentTypeCode,
      apply: async () => {
        await tx
          .update(nerisIncidents)
          .set({
            primaryIncidentTypeCode: input.event.incident.callType!,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidents.id, input.incidentId));
      },
    });
  }

  if (input.event.location?.fullAddress) {
    fields.push({
      fieldIdentifier: "incident.location.fullAddress",
      ownershipPolicy: "CAD_UNTIL_MANUAL_EDIT",
      cadValue: input.event.location.fullAddress,
      forgeValue: null,
      apply: async () => {
        const existing = await tx.query.nerisIncidentAddresses.findFirst({
          where: eq(nerisIncidentAddresses.incidentId, input.incidentId),
        });
        if (existing) {
          await tx
            .update(nerisIncidentAddresses)
            .set({
              addressLine1: input.event.location!.fullAddress!,
              city: input.event.location!.city ?? existing.city,
              state: input.event.location!.state ?? existing.state,
              postalCode: input.event.location!.postalCode ?? existing.postalCode,
              updatedAt: new Date(),
            })
            .where(eq(nerisIncidentAddresses.id, existing.id));
        } else {
          await tx.insert(nerisIncidentAddresses).values({
            id: createId(),
            tenantId: input.tenantId,
            incidentId: input.incidentId,
            addressLine1: input.event.location!.fullAddress!,
            city: input.event.location!.city ?? null,
            state: input.event.location!.state ?? null,
            postalCode: input.event.location!.postalCode ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        if (input.event.location!.latitude != null || input.event.location!.longitude != null) {
          const loc = await tx.query.nerisIncidentLocations.findFirst({
            where: eq(nerisIncidentLocations.incidentId, input.incidentId),
          });
          if (loc) {
            await tx
              .update(nerisIncidentLocations)
              .set({
                latitude: input.event.location!.latitude ?? loc.latitude,
                longitude: input.event.location!.longitude ?? loc.longitude,
                locationDescription: input.event.location!.fullAddress ?? loc.locationDescription,
                updatedAt: new Date(),
              })
              .where(eq(nerisIncidentLocations.id, loc.id));
          } else {
            await tx.insert(nerisIncidentLocations).values({
              id: createId(),
              tenantId: input.tenantId,
              incidentId: input.incidentId,
              latitude: input.event.location!.latitude ?? null,
              longitude: input.event.location!.longitude ?? null,
              locationDescription: input.event.location!.fullAddress ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
      },
    });
  }

  for (const field of fields) {
    const provenance = await tx.query.cadFieldProvenance.findFirst({
      where: and(
        eq(cadFieldProvenance.tenantId, input.tenantId),
        eq(cadFieldProvenance.incidentId, input.incidentId),
        eq(cadFieldProvenance.fieldIdentifier, field.fieldIdentifier),
      ),
    });

    const decision = decideFieldOwnership({
      ownershipPolicy: provenance?.ownershipPolicy ?? field.ownershipPolicy,
      forgeHasManualOverride: Boolean(provenance?.manualOverrideAt),
      forgeIsFinalized: incident.status === "FINALIZED",
      cadValuePresent: field.cadValue != null,
    });

    if (decision === "CREATE_CONFLICT") {
      await createConflict(tx, {
        tenantId: input.tenantId,
        connectionId: input.connectionId,
        rawMessageId: input.rawMessageId,
        normalizedEventId: input.normalizedEventId,
        incidentId: input.incidentId,
        conflictType:
          incident.status === "FINALIZED" ? "FINALIZED_RECORD_CONFLICT" : "VALUE_CONFLICT",
        fieldIdentifier: field.fieldIdentifier,
        ownershipPolicy: field.ownershipPolicy,
        recommendedResolution: "KEEP_FORGE",
        cadValueJson: field.cadValue,
        forgeValueJson: field.forgeValue,
      });
      continue;
    }

    if (decision === "KEEP_FORGE" || decision === "SKIP") {
      continue;
    }

    await field.apply();

    const sourceValueHash = createHash("sha256")
      .update(JSON.stringify(field.cadValue))
      .digest("hex");

    if (provenance) {
      await tx
        .update(cadFieldProvenance)
        .set({
          currentValueSource: "CAD",
          cadConnectionId: input.connectionId,
          cadRawMessageId: input.rawMessageId,
          cadNormalizedEventId: input.normalizedEventId,
          sourceValueHash,
          appliedAt: new Date(),
          updatedAt: new Date(),
          recordVersion: (provenance.recordVersion ?? 1) + 1,
        })
        .where(eq(cadFieldProvenance.id, provenance.id));
    } else {
      await tx.insert(cadFieldProvenance).values({
        id: createId(),
        tenantId: input.tenantId,
        incidentId: input.incidentId,
        fieldIdentifier: field.fieldIdentifier,
        currentValueSource: "CAD",
        sourceSystem: "CAD",
        cadConnectionId: input.connectionId,
        cadRawMessageId: input.rawMessageId,
        cadNormalizedEventId: input.normalizedEventId,
        sourceValueHash,
        ownershipPolicy: field.ownershipPolicy,
        appliedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  void input.createMode;
}

async function createConflict(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  input: {
    tenantId: string;
    connectionId: string;
    rawMessageId?: string;
    normalizedEventId?: string;
    incidentId?: string;
    conflictType: string;
    fieldIdentifier?: string;
    ownershipPolicy?: string;
    recommendedResolution?: string;
    cadValueJson?: unknown;
    forgeValueJson?: unknown;
    matchScore?: number;
    candidateIncidentIds?: string[];
  },
): Promise<void> {
  await tx.insert(cadConflicts).values({
    id: createId(),
    tenantId: input.tenantId,
    incidentId: input.incidentId ?? null,
    cadConnectionId: input.connectionId,
    cadRawMessageId: input.rawMessageId ?? null,
    cadNormalizedEventId: input.normalizedEventId ?? null,
    conflictType: input.conflictType,
    status: "OPEN",
    fieldIdentifier: input.fieldIdentifier ?? null,
    ownershipPolicy: input.ownershipPolicy ?? null,
    recommendedResolution: input.recommendedResolution ?? null,
    cadValueJson: toJsonObject(input.cadValueJson),
    forgeValueJson: toJsonObject(input.forgeValueJson),
    matchScore: input.matchScore ?? null,
    candidateIncidentIdsJson: input.candidateIncidentIds ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
