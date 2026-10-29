import {
  apiGet,
  apiGetResult,
  apiSend,
  apiSendResult,
  createIdempotencyKey,
  toIfMatch,
  type ApiResult,
} from "@forge/web-kit";

export type IncidentSummary = {
  id: string;
  incidentNumber: string;
  status: string;
  incidentDate: string | null;
  dispatchDescription: string | null;
  primaryIncidentTypeCode: string | null;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type IncidentDetail = IncidentSummary & {
  alarmAt: string | null;
  stationId: string | null;
  shiftId: string | null;
  responseDistrict: string | null;
  incidentSource: string | null;
  mutualAidStatus: string | null;
  aidDirection: string | null;
  operatingMode: string;
  reportOwnerUserId?: string | null;
  sections: Array<{ sectionKey: string; status: string; recordVersion: number }>;
};

export type FormDescriptorField = {
  fieldId: string;
  fieldKey: string;
  definition: string;
  dataType: string | null;
  required: boolean;
  displayLabel: string;
  helpText?: string | null;
  localAlias?: string | null;
  displayOrder: number;
  visible: boolean;
  valueSetLocation?: string | null;
  valueOverlays?: unknown[];
};

export type FormDescriptorModule = {
  moduleKey: string;
  name: string;
  area: string | null;
  sectionKey: string;
  specialtyGroupId?: string | null;
  visible: boolean;
  fields: FormDescriptorField[];
};

export type SpecialtyWorkflowGroup = {
  id: string;
  sectionKey: string;
  label: string;
  plainLanguageSummary: string;
  state: "HIDDEN" | "OPTIONAL" | "REQUIRED" | "ACTIVE" | "NOT_APPLICABLE";
  required: boolean;
  allowNotApplicable: boolean;
  activationReasons: string[];
  moduleKeys: string[];
  presentModuleKeys: string[];
  repeatableHints: string[];
  fieldCount?: number;
  requiredFieldCount?: number;
  filledRequiredFieldCount?: number;
  completionPercent?: number;
  hasBlockingGaps?: boolean;
};

export type AvailableSpecialtySection = {
  sectionKey: string;
  label: string;
  summary: string;
};

export type FormDescriptor = {
  schemaVersionId: string | null;
  operatingMode: string;
  sections: string[];
  navigationSections?: string[];
  specialtyWorkflows?: SpecialtyWorkflowGroup[];
  availableSpecialtySections?: AvailableSpecialtySection[];
  modules: FormDescriptorModule[];
};

export type NarrativePayload = {
  id: string;
  body: string;
  templateKey: string | null;
  recordVersion: number;
  updatedAt: string;
};

export type ValidationIssue = {
  severity: string;
  code: string;
  message: string;
  sectionKey?: string | null;
  fieldId?: string | null;
  technicalReference?: string | null;
};

export type StatusHistoryRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string | null;
  createdAt: string;
};

export type AuditEventRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  occurredAt: string;
  beforeJson?: unknown;
  afterJson?: unknown;
};

export type ValidationRun = {
  id: string;
  status: string;
  createdAt: string;
  results?: ValidationIssue[];
};

export type ReviewComment = {
  id: string;
  sectionKey: string | null;
  fieldId: string | null;
  specialtyRecordType?: string | null;
  specialtyRecordId?: string | null;
  attachmentId?: string | null;
  validationResultId?: string | null;
  reviewerRole?: string | null;
  assignedToUserId?: string | null;
  status?: string;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  body: string;
  authorUserId: string;
  createdAt: string;
};

export type ReviewCommentInput = {
  body: string;
  sectionKey?: string | null;
  fieldId?: string | null;
  specialtyRecordType?: string | null;
  specialtyRecordId?: string | null;
  attachmentId?: string | null;
  validationResultId?: string | null;
  reviewerRole?: string | null;
  assignedToUserId?: string | null;
};

export type LookupRow = {
  id: string;
  label: string;
  subtitle?: string;
  meta?: Record<string, unknown>;
};

export type UnitDetail = {
  id: string;
  unitNumber: string;
  callSign: string;
  unitType: string;
  apparatusId: string | null;
  stationId: string | null;
  status: string;
  recordVersion: number;
};

export type ApparatusDetail = {
  id: string;
  apparatusNumber: string;
  name: string;
  apparatusType: string;
  nerisClassification: string | null;
  status: string;
};

export type OccupancyDetail = {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  preplanId: string | null;
  status: string;
};

export type RosterDetail = {
  id: string;
  rosterDate: string;
  shiftId: string;
  stationId: string;
  status: string;
  assignments: Array<{
    id: string;
    personnelId: string;
    unitId: string | null;
    assignmentRole: string;
    isOfficer: boolean;
  }>;
};

export type IncidentUnitAssignment = {
  id: string;
  unitId: string;
  isPrimary: boolean;
  unitRole: string | null;
  recordVersion: number;
};

export type IncidentPersonnelAssignment = {
  id: string;
  personnelId: string;
  unitAssignmentId: string | null;
  role: string | null;
  recordVersion: number;
};

export type PrefillCandidate = {
  fieldKey: string;
  sectionKey: string;
  value: unknown;
  prefillSource: string;
};

type MasterDataKind = "personnel" | "units" | "apparatus" | "occupancies" | "stations" | "shifts";

function tenantBase(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}`;
}

export function listIncidents(
  tenantId: string,
  query: Record<string, string>,
): Promise<ApiResult<IncidentSummary[]>> {
  return apiGetResult<IncidentSummary[]>(`${tenantBase(tenantId)}/neris/incidents`, { query });
}

export function getIncident(
  tenantId: string,
  incidentId: string,
): Promise<ApiResult<IncidentDetail>> {
  return apiGetResult<IncidentDetail>(`${tenantBase(tenantId)}/neris/incidents/${incidentId}`);
}

export function createIncident(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<ApiResult<IncidentDetail>> {
  return apiSendResult<IncidentDetail>(`${tenantBase(tenantId)}/neris/incidents`, "POST", payload, {
    idempotencyKey: createIdempotencyKey("incident"),
  });
}

export function patchIncident(
  tenantId: string,
  incidentId: string,
  payload: Record<string, unknown>,
  recordVersion: number,
): Promise<ApiResult<IncidentDetail>> {
  return apiSendResult<IncidentDetail>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}`,
    "PATCH",
    payload,
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export function batchFieldValues(
  tenantId: string,
  incidentId: string,
  values: Array<Record<string, unknown>>,
  recordVersion: number,
): Promise<ApiResult<{ incident: IncidentDetail; upserted: number }>> {
  return apiSendResult<{ incident: IncidentDetail; upserted: number }>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/field-values`,
    "PATCH",
    { values },
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export function getFormDescriptor(tenantId: string, incidentId: string): Promise<FormDescriptor> {
  return apiGet<FormDescriptor>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/form-descriptor`,
  );
}

export async function postSpecialtySection(
  tenantId: string,
  incidentId: string,
  sectionKey: string,
  action: "ACTIVATE" | "MARK_NOT_APPLICABLE" | "CLEAR_NOT_APPLICABLE",
): Promise<{ incidentId: string; sectionKey: string; status: string }> {
  return apiSend<{ incidentId: string; sectionKey: string; status: string }>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/specialty-sections`,
    "POST",
    { sectionKey, action },
  );
}

export function getNarrative(
  tenantId: string,
  incidentId: string,
): Promise<NarrativePayload | null> {
  return apiGet<NarrativePayload | null>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/narrative`,
  );
}

export function upsertNarrative(
  tenantId: string,
  incidentId: string,
  body: string,
  recordVersion: number,
  versionNote?: string,
): Promise<ApiResult<NarrativePayload>> {
  return apiSendResult<NarrativePayload>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/narrative`,
    "PATCH",
    { body, versionNote: versionNote ?? null },
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export type ValidationResult = {
  runId: string;
  ok: boolean;
  findings: ValidationIssue[];
  blockingErrorCount: number;
  warningCount: number;
  guidanceCount: number;
};

export function validateIncident(tenantId: string, incidentId: string): Promise<ValidationResult> {
  return apiSend<ValidationResult>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/validate`,
    "POST",
  );
}

export function submitForReview(
  tenantId: string,
  incidentId: string,
  note?: string,
): Promise<IncidentDetail> {
  return apiSend<IncidentDetail>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/submit-for-review`,
    "POST",
    { note: note ?? null },
  );
}

export function returnIncident(
  tenantId: string,
  incidentId: string,
  reason: string,
  comments: Array<{ sectionKey?: string; fieldId?: string; body: string }>,
): Promise<IncidentDetail> {
  return apiSend<IncidentDetail>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/return`,
    "POST",
    {
      reason,
      comments,
    },
  );
}

export function approveIncident(tenantId: string, incidentId: string): Promise<IncidentDetail> {
  return apiSend<IncidentDetail>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/approve`,
    "POST",
  );
}

export function listReviewComments(tenantId: string, incidentId: string): Promise<ReviewComment[]> {
  return apiGet<ReviewComment[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/review-comments`,
  );
}

export function listStatusHistory(
  tenantId: string,
  incidentId: string,
): Promise<StatusHistoryRow[]> {
  return apiGet<StatusHistoryRow[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/status-history`,
  );
}

export function listAuditEvents(
  tenantId: string,
  page = 1,
  pageSize = 100,
): Promise<AuditEventRow[]> {
  return apiGet<AuditEventRow[]>(
    `${tenantBase(tenantId)}/audit-events?page=${page}&pageSize=${pageSize}`,
  );
}

export function addReviewComment(
  tenantId: string,
  incidentId: string,
  bodyOrInput: string | ReviewCommentInput,
  sectionKey?: string,
  fieldId?: string,
): Promise<ReviewComment> {
  const payload: ReviewCommentInput =
    typeof bodyOrInput === "string"
      ? { body: bodyOrInput, sectionKey: sectionKey ?? null, fieldId: fieldId ?? null }
      : bodyOrInput;
  return apiSend<ReviewComment>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/review-comments`,
    "POST",
    payload,
  );
}

export function resolveReviewComment(
  tenantId: string,
  incidentId: string,
  commentId: string,
  resolutionNote?: string,
): Promise<ReviewComment> {
  return apiSend<ReviewComment>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/review-comments/${commentId}/resolve`,
    "POST",
    { resolutionNote: resolutionNote ?? null },
  );
}

export function reopenReviewComment(
  tenantId: string,
  incidentId: string,
  commentId: string,
  note?: string,
): Promise<ReviewComment> {
  return apiSend<ReviewComment>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/review-comments/${commentId}/reopen`,
    "POST",
    { note: note ?? null },
  );
}

export function approveSpecialtySection(
  tenantId: string,
  incidentId: string,
  sectionKey: string,
  reviewerRole?: string,
  note?: string,
): Promise<unknown> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/section-approvals`,
    "POST",
    { sectionKey, reviewerRole: reviewerRole ?? null, note: note ?? null },
  );
}

export function returnSpecialtySection(
  tenantId: string,
  incidentId: string,
  input: {
    sectionKey: string;
    reason: string;
    specialtyRecordType?: string | null;
    specialtyRecordId?: string | null;
    reviewerRole?: string | null;
  },
): Promise<unknown> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/section-returns`,
    "POST",
    input,
  );
}

export function listValidationRuns(tenantId: string, incidentId: string): Promise<ValidationRun[]> {
  return apiGet<ValidationRun[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/validation-runs`,
  );
}

export type TenantNerisConfiguration = {
  id: string;
  tenantId: string;
  schemaVersionId: string | null;
  operatingMode: string;
  status: string;
  recordVersion: number;
};

export type FieldOverlay = {
  id: string;
  fieldId: string;
  displayLabel: string | null;
  helpText: string | null;
  localAlias: string | null;
  displayOrder: number | null;
  favorite: boolean;
  optionalVisible: boolean | null;
  safeDefaultJson: unknown;
  localValidationJson: unknown;
};

export function getTenantNerisConfiguration(
  tenantId: string,
): Promise<TenantNerisConfiguration | null> {
  return apiGet<TenantNerisConfiguration | null>(`${tenantBase(tenantId)}/neris/configuration`);
}

export function putTenantNerisConfiguration(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<TenantNerisConfiguration> {
  return apiSend<TenantNerisConfiguration>(
    `${tenantBase(tenantId)}/neris/configuration`,
    "PUT",
    payload,
  );
}

export function listFieldOverlays(tenantId: string): Promise<FieldOverlay[]> {
  return apiGet<FieldOverlay[]>(`${tenantBase(tenantId)}/neris/field-overlays`);
}

export function putFieldOverlay(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<FieldOverlay> {
  return apiSend<FieldOverlay>(`${tenantBase(tenantId)}/neris/field-overlays`, "PUT", payload);
}

function isActiveRecord(row: Record<string, unknown>): boolean {
  const status = row.status;
  return status === undefined || status === "ACTIVE";
}

export async function lookupMasterData(
  tenantId: string,
  kind: MasterDataKind,
  search: string,
  filters?: { stationId?: string; shiftId?: string; activeOnly?: boolean },
): Promise<LookupRow[]> {
  const path = `${tenantBase(tenantId)}/rms/${kind}`;
  const rows = await apiGet<Array<Record<string, unknown>>>(path, {
    query: { page: "1", pageSize: "50", search: search || undefined },
  });
  const activeOnly = filters?.activeOnly !== false;
  return rows
    .filter((row) => (activeOnly ? isActiveRecord(row) : true))
    .filter((row) => (filters?.stationId ? row.stationId === filters.stationId : true))
    .filter((row) => (filters?.shiftId ? row.shiftId === filters.shiftId : true))
    .map((row) => mapLookupRow(kind, row));
}

function mapLookupRow(kind: string, row: Record<string, unknown>): LookupRow {
  switch (kind) {
    case "personnel":
      return {
        id: String(row.id),
        label: String(row.rank ?? row.personId ?? row.id),
        subtitle: String(row.qualificationSummary ?? ""),
        meta: row,
      };
    case "units":
      return {
        id: String(row.id),
        label: String(row.callSign ?? row.unitNumber ?? row.id),
        subtitle: String(row.unitType ?? ""),
        meta: row,
      };
    case "apparatus":
      return {
        id: String(row.id),
        label: String(row.name ?? row.apparatusNumber ?? row.id),
        subtitle: String(row.apparatusType ?? ""),
        meta: row,
      };
    case "occupancies":
      return {
        id: String(row.id),
        label: String(row.name ?? row.id),
        subtitle: [row.addressLine1, row.city, row.state].filter(Boolean).join(", "),
        meta: row,
      };
    case "stations":
      return {
        id: String(row.id),
        label: String(row.name ?? row.stationNumber ?? row.id),
        subtitle: [row.stationNumber, row.city].filter(Boolean).join(" · "),
        meta: row,
      };
    case "shifts":
      return {
        id: String(row.id),
        label: String(row.name ?? row.code ?? row.id),
        subtitle: String(row.code ?? ""),
        meta: row,
      };
    default:
      return { id: String(row.id), label: String(row.id), meta: row };
  }
}

export function getPersonnelDetail(
  tenantId: string,
  personnelId: string,
): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`${tenantBase(tenantId)}/rms/personnel/${personnelId}`);
}

export function getUnitDetail(tenantId: string, unitId: string): Promise<UnitDetail> {
  return apiGet<UnitDetail>(`${tenantBase(tenantId)}/rms/units/${unitId}`);
}

export function getApparatusDetail(
  tenantId: string,
  apparatusId: string,
): Promise<ApparatusDetail> {
  return apiGet<ApparatusDetail>(`${tenantBase(tenantId)}/rms/apparatus/${apparatusId}`);
}

export function getOccupancyDetail(
  tenantId: string,
  occupancyId: string,
): Promise<OccupancyDetail> {
  return apiGet<OccupancyDetail>(`${tenantBase(tenantId)}/rms/occupancies/${occupancyId}`);
}

export async function findDailyRoster(
  tenantId: string,
  input: { stationId: string; shiftId: string; rosterDate: string },
): Promise<RosterDetail | null> {
  const rows = await apiGet<Array<Record<string, unknown>>>(`${tenantBase(tenantId)}/rms/rosters`, {
    query: { page: "1", pageSize: "25" },
  });
  const match = rows.find(
    (row) =>
      row.stationId === input.stationId &&
      row.shiftId === input.shiftId &&
      row.rosterDate === input.rosterDate &&
      row.status === "ACTIVE",
  );
  if (!match) return null;
  return getRosterDetail(tenantId, String(match.id));
}

export function getRosterDetail(tenantId: string, rosterId: string): Promise<RosterDetail> {
  return apiGet<RosterDetail>(`${tenantBase(tenantId)}/rms/rosters/${rosterId}`);
}

export function listIncidentUnits(
  tenantId: string,
  incidentId: string,
): Promise<IncidentUnitAssignment[]> {
  return apiGet<IncidentUnitAssignment[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/units`,
  );
}

export function createIncidentUnit(
  tenantId: string,
  incidentId: string,
  payload: { unitId: string; isPrimary?: boolean; unitRole?: string | null },
): Promise<ApiResult<IncidentUnitAssignment>> {
  return apiSendResult<IncidentUnitAssignment>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/units`,
    "POST",
    payload,
  );
}

export function deleteIncidentUnit(
  tenantId: string,
  incidentId: string,
  assignmentId: string,
  recordVersion: number,
): Promise<void> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/units/${assignmentId}`,
    "DELETE",
    undefined,
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export function listIncidentPersonnel(
  tenantId: string,
  incidentId: string,
): Promise<IncidentPersonnelAssignment[]> {
  return apiGet<IncidentPersonnelAssignment[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/personnel`,
  );
}

export function createIncidentPersonnel(
  tenantId: string,
  incidentId: string,
  payload: {
    personnelId: string;
    unitAssignmentId?: string | null;
    role?: string | null;
  },
): Promise<ApiResult<IncidentPersonnelAssignment>> {
  return apiSendResult<IncidentPersonnelAssignment>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/personnel`,
    "POST",
    payload,
  );
}

export function deleteIncidentPersonnel(
  tenantId: string,
  incidentId: string,
  assignmentId: string,
  recordVersion: number,
): Promise<void> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/personnel/${assignmentId}`,
    "DELETE",
    undefined,
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export function getPrefillCandidates(
  tenantId: string,
  incidentId: string,
  query: {
    stationId?: string;
    personnelId?: string;
    occupancyId?: string;
    preplanId?: string;
  },
): Promise<PrefillCandidate[]> {
  return apiGet<PrefillCandidate[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/prefill`,
    {
      query: {
        stationId: query.stationId,
        personnelId: query.personnelId,
        occupancyId: query.occupancyId,
        preplanId: query.preplanId,
      },
    },
  );
}

export async function lookupValueSetOptions(
  tenantId: string,
  valueSetLocation: string,
  search: string,
): Promise<LookupRow[]> {
  const encoded = encodeURIComponent(valueSetLocation);
  const rows = await apiGet<Array<{ id: string; code: string; label: string }>>(
    `/api/v1/platform/neris/value-sets/${encoded}/options`,
    { query: { search, pageSize: "25" } },
  ).catch(() => []);
  return rows.map((row) => ({ id: row.id, label: row.label, subtitle: row.code }));
}

export type CadConnection = {
  id: string;
  publicId: string;
  name: string;
  vendor: string;
  adapterKey: string;
  adapterVersion: string;
  environment: string;
  transportType: string;
  status: string;
  intakeMode: string;
  healthStatus: string;
  recordVersion: number;
  hasCredentialsSecret: boolean;
  hasWebhookSecret: boolean;
  webhookKeyId?: string | null;
  lastMessageAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorSummary?: string | null;
  updatedAt: string;
};

export type CadOperationsSummary = {
  connections: CadConnection[];
  messages: {
    received: number;
    applied: number;
    duplicates: number;
    failed: number;
    deadLetter: number;
    requiresReview: number;
    byStatus: Record<string, number>;
  };
  openConflicts: number;
  unmappedValues: number;
  unknownUnits: number;
  unknownPersonnel: number;
  activeLinks: number;
};

export type CadConflict = {
  id: string;
  incidentId: string | null;
  conflictType: string;
  status: string;
  severity: string;
  fieldIdentifier: string | null;
  resolutionReason: string | null;
  recordVersion: number;
  createdAt: string;
};

export type CadUnmappedValue = {
  id: string;
  category: string;
  sourceField: string;
  sourceValue: string;
  occurrenceCount: number;
  status: string;
  recordVersion: number;
  lastSeenAt: string;
};

export type CadUnknownUnit = {
  id: string;
  sourceUnitId: string;
  sourceUnitCallsign: string | null;
  occurrenceCount: number;
  status: string;
  recordVersion: number;
  lastSeenAt: string;
};

export type CadUnknownPersonnel = {
  id: string;
  sourcePersonnelId: string;
  sourceName: string | null;
  occurrenceCount: number;
  status: string;
  recordVersion: number;
  lastSeenAt: string;
};

export type CadRawMessageMeta = {
  id: string;
  receivedAt: string;
  transportType: string;
  sourceMessageId: string | null;
  sourceIncidentId: string | null;
  processingStatus: string;
  authenticationStatus: string;
  payloadSizeBytes: number | null;
  payloadHash: string | null;
  correlationId: string | null;
  cadConnectionId: string;
};

export type CadIncidentStatus = {
  links: Array<{
    id: string;
    cadConnectionId: string;
    sourceIncidentId: string;
    sourceIncidentNumber: string | null;
    linkStatus: string;
    linkMethod: string;
    recordVersion: number;
    updatedAt: string;
  }>;
  openConflicts: CadConflict[];
  operatingHints: { linked: boolean; conflictCount: number };
};

export function getCadOperationsSummary(tenantId: string): Promise<CadOperationsSummary> {
  return apiGet<CadOperationsSummary>(`${tenantBase(tenantId)}/cad/operations/summary`);
}

export function listCadConnections(tenantId: string): Promise<CadConnection[]> {
  return apiGet<CadConnection[]>(`${tenantBase(tenantId)}/cad/connections`);
}

export function createCadConnection(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<CadConnection> {
  return apiSend<CadConnection>(`${tenantBase(tenantId)}/cad/connections`, "POST", payload);
}

export function enableCadConnection(
  tenantId: string,
  connectionId: string,
): Promise<CadConnection> {
  return apiSend<CadConnection>(
    `${tenantBase(tenantId)}/cad/connections/${connectionId}/enable`,
    "POST",
  );
}

export function disableCadConnection(
  tenantId: string,
  connectionId: string,
): Promise<CadConnection> {
  return apiSend<CadConnection>(
    `${tenantBase(tenantId)}/cad/connections/${connectionId}/disable`,
    "POST",
  );
}

export function testCadConnection(
  tenantId: string,
  connectionId: string,
): Promise<{ healthy: boolean; status: string; checkedAt: string; connection: CadConnection }> {
  return apiSend(`${tenantBase(tenantId)}/cad/connections/${connectionId}/test`, "POST");
}

export function listCadConflicts(
  tenantId: string,
  query: Record<string, string> = {},
): Promise<CadConflict[]> {
  return apiGet<CadConflict[]>(`${tenantBase(tenantId)}/cad/conflicts`, { query });
}

export function resolveCadConflict(
  tenantId: string,
  conflictId: string,
  payload: {
    resolutionAction: string;
    resolutionReason: string;
    recordVersion: number;
  },
): Promise<CadConflict> {
  return apiSend<CadConflict>(
    `${tenantBase(tenantId)}/cad/conflicts/${conflictId}/resolve`,
    "POST",
    payload,
  );
}

export function listCadUnmappedValues(tenantId: string): Promise<CadUnmappedValue[]> {
  return apiGet<CadUnmappedValue[]>(`${tenantBase(tenantId)}/cad/unmapped-values`);
}

export function resolveCadUnmappedValue(
  tenantId: string,
  unmappedId: string,
  payload: { resolutionReason: string; recordVersion: number; status?: string },
): Promise<CadUnmappedValue> {
  return apiSend<CadUnmappedValue>(
    `${tenantBase(tenantId)}/cad/unmapped-values/${unmappedId}/resolve`,
    "POST",
    payload,
  );
}

export function listCadUnknownUnits(tenantId: string): Promise<CadUnknownUnit[]> {
  return apiGet<CadUnknownUnit[]>(`${tenantBase(tenantId)}/cad/unknown-units`);
}

export function resolveCadUnknownUnit(
  tenantId: string,
  unknownId: string,
  payload: Record<string, unknown>,
): Promise<CadUnknownUnit> {
  return apiSend<CadUnknownUnit>(
    `${tenantBase(tenantId)}/cad/unknown-units/${unknownId}/resolve`,
    "POST",
    payload,
  );
}

export function listCadUnknownPersonnel(tenantId: string): Promise<CadUnknownPersonnel[]> {
  return apiGet<CadUnknownPersonnel[]>(`${tenantBase(tenantId)}/cad/unknown-personnel`);
}

export function resolveCadUnknownPersonnel(
  tenantId: string,
  unknownId: string,
  payload: Record<string, unknown>,
): Promise<CadUnknownPersonnel> {
  return apiSend<CadUnknownPersonnel>(
    `${tenantBase(tenantId)}/cad/unknown-personnel/${unknownId}/resolve`,
    "POST",
    payload,
  );
}

export function listCadMessages(tenantId: string): Promise<CadRawMessageMeta[]> {
  return apiGet<CadRawMessageMeta[]>(`${tenantBase(tenantId)}/cad/messages`);
}

export function getIncidentCadStatus(
  tenantId: string,
  incidentId: string,
): Promise<CadIncidentStatus> {
  return apiGet<CadIncidentStatus>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/cad-status`,
  );
}

// ---------------------------------------------------------------------------
// AI Narrative Assistant (tenant-scoped via auth principal; flags default off)
// ---------------------------------------------------------------------------

export type AiNarrativeRequestType =
  | "GENERATE_FROM_RECORD"
  | "IMPROVE_EXISTING"
  | "GRAMMAR_AND_CLARITY"
  | "EXPAND_BRIEF_NOTES"
  | "CONDENSE"
  | "PROFESSIONALIZE"
  | "ACTIVE_VOICE"
  | "TIMELINE_FORMAT"
  | "QUALITY_REVIEW"
  | "MISSING_INFORMATION_CHECK"
  | "CONTRADICTION_CHECK";

export type AiNarrativeDraft = {
  id: string;
  draftText: string;
  structuredResponseJson: {
    narrative?: string;
    missingInformation?: string[];
    conflicts?: string[];
    warnings?: string[];
    unsupportedClaims?: string[];
    sourceReferences?: string[];
  };
  confidenceSummary: string | null;
  warningsJson: unknown;
  missingInformationJson: unknown;
  unsupportedClaimsJson: unknown;
  sourceMappingJson: unknown;
  label: string;
  version: number;
  acceptedAt: string | null;
};

export type AiNarrativeSource = {
  id: string;
  manifestJson: {
    fields?: Array<{
      fieldId: string;
      label: string;
      category: string;
      included: boolean;
      redacted?: boolean;
      valuePreview?: string;
    }>;
    sourceHash?: string;
  };
  redactionSummaryJson: unknown;
};

export type AiNarrativeBundle = {
  request: {
    id: string;
    status: string;
    requestType: string;
    product: string;
    module: string;
    recordType: string;
    recordId: string;
    provider: string | null;
    createdAt: string;
  };
  sources: AiNarrativeSource[];
  drafts: AiNarrativeDraft[];
  requiredWarning: string;
  humanReviewRequired: boolean;
};

export type AiNarrativeHistory = {
  request: AiNarrativeBundle["request"];
  drafts: AiNarrativeDraft[];
  revisions: Array<{
    id: string;
    action: string;
    createdAt: string;
    snapshotJson: unknown;
  }>;
};

export function createAiNarrative(payload: {
  product: "RMS";
  module: string;
  recordType: string;
  recordId: string;
  requestType: AiNarrativeRequestType;
  acknowledgeWarning: true;
  existingNarrative?: string | null;
  tone?: "NEUTRAL" | "FORMAL" | "CONCISE" | "DETAILED";
  detailLevel?: "BRIEF" | "STANDARD" | "DETAILED";
  authorizeSensitiveData?: boolean;
}): Promise<AiNarrativeBundle> {
  return apiSend<AiNarrativeBundle>("/api/v1/ai/narratives", "POST", {
    tone: "NEUTRAL",
    detailLevel: "STANDARD",
    includeCategories: [],
    excludeCategories: [],
    authorizeSensitiveData: false,
    idempotencyKey: createIdempotencyKey("ai-narrative"),
    ...payload,
  });
}

export function getAiNarrative(requestId: string): Promise<AiNarrativeBundle> {
  return apiGet<AiNarrativeBundle>(`/api/v1/ai/narratives/${requestId}`);
}

export function regenerateAiNarrative(requestId: string): Promise<AiNarrativeBundle> {
  return apiSend<AiNarrativeBundle>(`/api/v1/ai/narratives/${requestId}/regenerate`, "POST");
}

export function acceptAiNarrative(
  requestId: string,
  payload: {
    draftId: string;
    mode?: "ACCEPT_ALL" | "PARTIAL";
    selectedSections?: string[];
    insertIntoRecord?: boolean;
    feedback?: string | null;
  },
): Promise<AiNarrativeBundle> {
  return apiSend<AiNarrativeBundle>(`/api/v1/ai/narratives/${requestId}/accept`, "POST", payload);
}

export function partialAcceptAiNarrative(
  requestId: string,
  payload: {
    draftId: string;
    selectedSections?: string[];
    insertIntoRecord?: boolean;
    feedback?: string | null;
  },
): Promise<AiNarrativeBundle> {
  return apiSend<AiNarrativeBundle>(
    `/api/v1/ai/narratives/${requestId}/partial-accept`,
    "POST",
    payload,
  );
}

export function rejectAiNarrative(
  requestId: string,
  payload: { draftId: string; reason: string; feedback?: string | null },
): Promise<AiNarrativeBundle> {
  return apiSend<AiNarrativeBundle>(`/api/v1/ai/narratives/${requestId}/reject`, "POST", payload);
}

export function getAiNarrativeHistory(requestId: string): Promise<AiNarrativeHistory> {
  return apiGet<AiNarrativeHistory>(`/api/v1/ai/narratives/${requestId}/history`);
}
