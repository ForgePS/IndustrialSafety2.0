import type {
  CadNormalizedEvent,
  CadNormalizedPersonnel,
  CadNormalizedUnit,
} from "@forge/cad-contracts";
import {
  cadPersonnelMappings,
  cadUnitMappings,
  cadUnknownPersonnel,
  cadUnknownUnits,
  createId,
  nerisIncidentPersonnel,
  nerisIncidentUnits,
  rmsPersonnel,
  rmsUnits,
  type DatabaseTransaction,
} from "@forge/database";
import { and, eq, isNull } from "drizzle-orm";

export async function applyCadAssignments(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    incidentId: string;
    connectionId: string;
    rawMessageId: string;
    event: CadNormalizedEvent;
  },
): Promise<void> {
  await applyUnits(tx, input, input.event.units ?? []);
  await applyPersonnel(tx, input, input.event.personnel ?? []);
}

async function applyUnits(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    incidentId: string;
    connectionId: string;
    rawMessageId: string;
  },
  units: CadNormalizedUnit[],
) {
  const current = await tx.query.nerisIncidentUnits.findMany({
    where: and(
      eq(nerisIncidentUnits.tenantId, input.tenantId),
      eq(nerisIncidentUnits.incidentId, input.incidentId),
    ),
  });
  let hasPrimary = current.some((row) => row.isPrimary && !row.deletedAt);

  for (const unit of units) {
    const mapping = await tx.query.cadUnitMappings.findFirst({
      where: and(
        eq(cadUnitMappings.tenantId, input.tenantId),
        eq(cadUnitMappings.cadConnectionId, input.connectionId),
        eq(cadUnitMappings.sourceUnitId, unit.sourceUnitId),
        eq(cadUnitMappings.status, "ACTIVE"),
      ),
    });

    const forgeUnitId = mapping
      ? await resolveForgeUnitId(tx, input.tenantId, mapping.forgeUnitId, mapping.forgeApparatusId)
      : null;
    if (!forgeUnitId) {
      if (mapping?.externalAgency) continue;
      await recordUnknownUnit(tx, input, unit);
      continue;
    }

    const existing = await tx.query.nerisIncidentUnits.findFirst({
      where: and(
        eq(nerisIncidentUnits.tenantId, input.tenantId),
        eq(nerisIncidentUnits.incidentId, input.incidentId),
        eq(nerisIncidentUnits.unitId, forgeUnitId),
      ),
    });

    const now = new Date();
    const isPrimary = existing?.isPrimary ?? !hasPrimary;
    if (isPrimary) hasPrimary = true;
    const values = {
      isPrimary,
      unitRole: existing?.unitRole ?? "CAD_RESPONSE",
      dispatchedAt: unit.dispatchedAt ? new Date(unit.dispatchedAt) : existing?.dispatchedAt ?? null,
      enRouteAt: unit.enRouteAt ? new Date(unit.enRouteAt) : existing?.enRouteAt ?? null,
      arrivedAt: unit.arrivedAt ? new Date(unit.arrivedAt) : existing?.arrivedAt ?? null,
      clearedAt: unit.clearedAt ? new Date(unit.clearedAt) : existing?.clearedAt ?? null,
      deletedAt: null,
      updatedAt: now,
    };

    if (existing) {
      await tx
        .update(nerisIncidentUnits)
        .set({ ...values, recordVersion: existing.recordVersion + 1 })
        .where(eq(nerisIncidentUnits.id, existing.id));
    } else {
      await tx.insert(nerisIncidentUnits).values({
        id: createId(),
        tenantId: input.tenantId,
        incidentId: input.incidentId,
        unitId: forgeUnitId,
        ...values,
        createdAt: now,
      });
    }
  }
}

async function recordUnknownUnit(
  tx: DatabaseTransaction,
  input: { tenantId: string; connectionId: string; rawMessageId: string },
  unit: CadNormalizedUnit,
) {
  const existing = await tx.query.cadUnknownUnits.findFirst({
    where: and(
      eq(cadUnknownUnits.tenantId, input.tenantId),
      eq(cadUnknownUnits.cadConnectionId, input.connectionId),
      eq(cadUnknownUnits.sourceUnitId, unit.sourceUnitId),
    ),
  });
  const now = new Date();

  if (existing) {
    await tx
      .update(cadUnknownUnits)
      .set({
        sourceUnitCallsign: unit.sourceUnitCallsign ?? existing.sourceUnitCallsign,
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: now,
        lastRawMessageId: input.rawMessageId,
        status: ["IGNORED_WITH_REASON", "ESCALATED"].includes(existing.status)
          ? existing.status
          : "OPEN",
        recordVersion: existing.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(cadUnknownUnits.id, existing.id));
  } else {
    await tx.insert(cadUnknownUnits).values({
      id: createId(),
      tenantId: input.tenantId,
      cadConnectionId: input.connectionId,
      sourceUnitId: unit.sourceUnitId,
      sourceUnitCallsign: unit.sourceUnitCallsign ?? null,
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastRawMessageId: input.rawMessageId,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function applyPersonnel(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    incidentId: string;
    connectionId: string;
    rawMessageId: string;
  },
  personnel: CadNormalizedPersonnel[],
) {
  for (const person of personnel) {
    const mapping = await tx.query.cadPersonnelMappings.findFirst({
      where: and(
        eq(cadPersonnelMappings.tenantId, input.tenantId),
        eq(cadPersonnelMappings.cadConnectionId, input.connectionId),
        eq(cadPersonnelMappings.sourcePersonnelId, person.sourcePersonnelId),
        eq(cadPersonnelMappings.status, "ACTIVE"),
      ),
    });

    const forgePersonnelId = mapping
      ? await resolveForgePersonnelId(
          tx,
          input.tenantId,
          mapping.forgePersonnelId,
          mapping.forgePersonId,
        )
      : null;
    if (!forgePersonnelId) {
      if (mapping?.externalAgency) continue;
      await recordUnknownPersonnel(tx, input, person);
      continue;
    }

    const existing = await tx.query.nerisIncidentPersonnel.findFirst({
      where: and(
        eq(nerisIncidentPersonnel.tenantId, input.tenantId),
        eq(nerisIncidentPersonnel.incidentId, input.incidentId),
        eq(nerisIncidentPersonnel.personnelId, forgePersonnelId),
      ),
    });

    const now = new Date();
    if (existing) {
      await tx
        .update(nerisIncidentPersonnel)
        .set({
          role: person.role ?? existing.role,
          deletedAt: null,
          recordVersion: existing.recordVersion + 1,
          updatedAt: now,
        })
        .where(eq(nerisIncidentPersonnel.id, existing.id));
    } else {
      await tx.insert(nerisIncidentPersonnel).values({
        id: createId(),
        tenantId: input.tenantId,
        incidentId: input.incidentId,
        personnelId: forgePersonnelId,
        unitAssignmentId: null,
        role: person.role ?? "RESPONDER",
        exposureInvolved: false,
        isIncidentCommander: false,
        isReportingOfficer: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function recordUnknownPersonnel(
  tx: DatabaseTransaction,
  input: { tenantId: string; connectionId: string; rawMessageId: string },
  person: CadNormalizedPersonnel,
) {
  const existing = await tx.query.cadUnknownPersonnel.findFirst({
    where: and(
      eq(cadUnknownPersonnel.tenantId, input.tenantId),
      eq(cadUnknownPersonnel.cadConnectionId, input.connectionId),
      eq(cadUnknownPersonnel.sourcePersonnelId, person.sourcePersonnelId),
    ),
  });
  const now = new Date();

  if (existing) {
    await tx
      .update(cadUnknownPersonnel)
      .set({
        sourceName: person.sourceName ?? existing.sourceName,
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: now,
        lastRawMessageId: input.rawMessageId,
        status: ["IGNORED_WITH_REASON", "ESCALATED"].includes(existing.status)
          ? existing.status
          : "OPEN",
        recordVersion: existing.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(cadUnknownPersonnel.id, existing.id));
  } else {
    await tx.insert(cadUnknownPersonnel).values({
      id: createId(),
      tenantId: input.tenantId,
      cadConnectionId: input.connectionId,
      sourcePersonnelId: person.sourcePersonnelId,
      sourceName: person.sourceName ?? null,
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastRawMessageId: input.rawMessageId,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
  }
}


async function resolveForgeUnitId(
  tx: DatabaseTransaction,
  tenantId: string,
  forgeUnitId: string | null,
  forgeApparatusId: string | null,
): Promise<string | null> {
  if (forgeUnitId) return forgeUnitId;
  if (!forgeApparatusId) return null;
  const unit = await tx.query.rmsUnits.findFirst({
    where: and(
      eq(rmsUnits.tenantId, tenantId),
      eq(rmsUnits.apparatusId, forgeApparatusId),
      eq(rmsUnits.status, "ACTIVE"),
      isNull(rmsUnits.deletedAt),
    ),
  });
  return unit?.id ?? null;
}

async function resolveForgePersonnelId(
  tx: DatabaseTransaction,
  tenantId: string,
  forgePersonnelId: string | null,
  forgePersonId: string | null,
): Promise<string | null> {
  if (forgePersonnelId) return forgePersonnelId;
  if (!forgePersonId) return null;
  const personnel = await tx.query.rmsPersonnel.findFirst({
    where: and(
      eq(rmsPersonnel.tenantId, tenantId),
      eq(rmsPersonnel.personId, forgePersonId),
      eq(rmsPersonnel.status, "ACTIVE"),
      isNull(rmsPersonnel.deletedAt),
    ),
  });
  return personnel?.id ?? null;
}
