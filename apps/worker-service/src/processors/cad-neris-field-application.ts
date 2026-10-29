import type { CadNormalizedEvent } from "@forge/cad-contracts";
import {
  createId,
  nerisFields,
  nerisIncidentFieldValues,
  nerisIncidents,
  type DatabaseTransaction,
} from "@forge/database";
import { and, eq, isNull } from "drizzle-orm";

export type CadDispatchFieldCandidate = {
  fieldKey: string;
  valueText?: string;
  valueTimestamp?: Date;
  valueJson?: unknown;
};

export function buildCadDispatchFieldCandidates(
  event: CadNormalizedEvent,
): CadDispatchFieldCandidate[] {
  const candidates: CadDispatchFieldCandidate[] = [];

  if (event.source.incidentId) {
    candidates.push({ fieldKey: "dispatch_internal_id", valueText: event.source.incidentId });
  }
  if (event.incident.callType) {
    candidates.push({ fieldKey: "dispatch_incident_code", valueText: event.incident.callType });
  }

  const disposition = event.disposition?.description ?? event.disposition?.code;
  if (disposition) {
    candidates.push({ fieldKey: "dispatch_final_disposition", valueText: disposition });
  }
  if (event.timestamps?.callReceived) {
    candidates.push({
      fieldKey: "dispatch_time_call_arrival",
      valueTimestamp: new Date(event.timestamps.callReceived),
    });
  }
  if (event.timestamps?.callEntered) {
    candidates.push({
      fieldKey: "dispatch_time_call_create",
      valueTimestamp: new Date(event.timestamps.callEntered),
    });
  }
  if (event.timestamps?.closed) {
    candidates.push({
      fieldKey: "time_incident_clear",
      valueTimestamp: new Date(event.timestamps.closed),
    });
  }

  const comments = (event.comments ?? [])
    .filter((item) => !item.restricted)
    .map((item) => item.text)
    .filter(Boolean);
  if (comments.length) {
    candidates.push({ fieldKey: "dispatch_comment", valueJson: comments });
  }

  return candidates;
}

export async function applyCadNerisDispatchFields(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    incidentId: string;
    event: CadNormalizedEvent;
  },
): Promise<void> {
  const incident = await tx.query.nerisIncidents.findFirst({
    where: and(
      eq(nerisIncidents.id, input.incidentId),
      eq(nerisIncidents.tenantId, input.tenantId),
      isNull(nerisIncidents.deletedAt),
    ),
  });
  if (!incident) throw new Error("incident missing for CAD field application");

  const candidates = buildCadDispatchFieldCandidates(input.event);
  if (!candidates.length) return;

  const fields = await tx
    .select()
    .from(nerisFields)
    .where(eq(nerisFields.schemaVersionId, incident.schemaVersionId));
  const byKey = new Map(fields.map((field) => [field.fieldKey, field]));

  for (const candidate of candidates) {
    const field = byKey.get(candidate.fieldKey);
    if (!field) continue;
    const existing = await tx.query.nerisIncidentFieldValues.findFirst({
      where: and(
        eq(nerisIncidentFieldValues.tenantId, input.tenantId),
        eq(nerisIncidentFieldValues.incidentId, input.incidentId),
        eq(nerisIncidentFieldValues.fieldId, field.id),
        eq(nerisIncidentFieldValues.sectionKey, "DISPATCH"),
        isNull(nerisIncidentFieldValues.repeatableItemId),
      ),
    });
    if (existing?.userConfirmed) continue;

    const now = new Date();
    const payload = {
      valueText: candidate.valueText ?? null,
      valueTimestamp: candidate.valueTimestamp ?? null,
      valueJson: candidate.valueJson ?? null,
      prefillSource: "CAD",
      userConfirmed: false,
      updatedAt: now,
    };

    if (existing) {
      await tx
        .update(nerisIncidentFieldValues)
        .set({ ...payload, recordVersion: existing.recordVersion + 1 })
        .where(eq(nerisIncidentFieldValues.id, existing.id));
    } else {
      await tx.insert(nerisIncidentFieldValues).values({
        id: createId(),
        tenantId: input.tenantId,
        incidentId: input.incidentId,
        fieldId: field.id,
        sectionKey: "DISPATCH",
        repeatableItemId: null,
        ...payload,
        createdAt: now,
      });
    }
  }
}
