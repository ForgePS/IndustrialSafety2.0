import { z } from "zod";
import { RMS_CAD_PERMISSIONS, RMS_CAD_RESTRICTED_PERMISSIONS } from "@forge/cad-contracts";
import { AI_NARRATIVE_PERMISSIONS, RMS_AI_NARRATIVE_PERMISSIONS } from "@forge/ai-contracts";

/** Tenant-scoped RMS / NERIS incident permissions (Phase 2/3/4). Not creator-only. */
export const RMS_PERMISSIONS = [
  "rms.neris.incident.view",
  "rms.neris.incident.create",
  "rms.neris.incident.edit",
  "rms.neris.incident.assign",
  "rms.neris.incident.submit_review",
  "rms.neris.incident.review",
  "rms.neris.incident.approve",
  "rms.neris.incident.return",
  "rms.neris.incident.finalize",
  "rms.neris.incident.void",
  "rms.neris.incident.archive",
  "rms.neris.configuration.view",
  "rms.neris.configuration.manage",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
  "rms.neris.exposure.view",
  "rms.neris.exposure.edit",
  "rms.neris.civilian_casualty.view",
  "rms.neris.civilian_casualty.edit",
  "rms.neris.fire_service_casualty.view",
  "rms.neris.fire_service_casualty.edit",
  "rms.neris.hazmat.view",
  "rms.neris.hazmat.edit",
  "rms.neris.alarm_system.view",
  "rms.neris.alarm_system.edit",
  "rms.neris.protection_system.view",
  "rms.neris.protection_system.edit",
  "rms.neris.attachments.view",
  "rms.neris.attachments.upload",
  "rms.neris.attachments.archive",
  "rms.neris.specialty.review",
  "rms.neris.safety_review",
  "rms.masterdata.read",
  "rms.masterdata.manage",
  ...RMS_CAD_PERMISSIONS,
  ...RMS_CAD_RESTRICTED_PERMISSIONS,
  ...AI_NARRATIVE_PERMISSIONS,
  ...RMS_AI_NARRATIVE_PERMISSIONS,
] as const;

export type RmsPermission = (typeof RMS_PERMISSIONS)[number];

export const NERIS_INCIDENT_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "SUBMITTED_FOR_REVIEW",
  "RETURNED_FOR_CORRECTION",
  "APPROVED",
  "FINALIZED",
  "VOIDED",
  "ARCHIVED",
] as const;

export type NerisIncidentStatus = (typeof NERIS_INCIDENT_STATUSES)[number];

export const PREFILL_SOURCES = [
  "TENANT_DEFAULT",
  "USER_DEFAULT",
  "ROSTER",
  "PERSONNEL",
  "APPARATUS",
  "OCCUPANCY",
  "PREPLAN",
  "MANUAL",
  "COMPUTED",
  "CAD",
  "FUTURE_CAD",
] as const;

export type PrefillSource = (typeof PREFILL_SOURCES)[number];

export const VALIDATION_SEVERITIES = ["GUIDANCE", "WARNING", "BLOCKING_ERROR"] as const;
export const VALIDATION_SOURCES = [
  "NERIS_SCHEMA",
  "NERIS_CONDITION",
  "TENANT_CONFIGURATION",
  "WORKFLOW",
  "DATA_INTEGRITY",
  "TIME_SEQUENCE",
  "DUPLICATE_DETECTION",
] as const;

export const NUMBER_RESET_MODES = ["CALENDAR", "FISCAL", "NONE"] as const;
export const NUMBER_SCOPES = ["NONE", "STATION", "CATEGORY"] as const;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
  search: z.string().max(200).optional(),
});

export const createStationInputSchema = z.object({
  stationNumber: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  addressLine1: z.string().max(300).optional().nullable(),
  addressLine2: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(64).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
  timezone: z.string().max(64).default("America/Chicago"),
  defaultResponseDistrict: z.string().max(120).optional().nullable(),
});

export const createShiftInputSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(32),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  scheduleReference: z.string().max(200).optional().nullable(),
});

export const createApparatusInputSchema = z.object({
  apparatusNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  apparatusType: z.string().min(1).max(64),
  stationId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_SERVICE"]).default("ACTIVE"),
  nerisClassification: z.string().max(120).optional().nullable(),
});

export const createUnitInputSchema = z.object({
  unitNumber: z.string().min(1).max(64),
  callSign: z.string().min(1).max(64),
  unitType: z.string().min(1).max(64),
  apparatusId: z.string().uuid().optional().nullable(),
  stationId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_SERVICE"]).default("ACTIVE"),
});

export const createRmsPersonnelInputSchema = z.object({
  personId: z.string().uuid(),
  rank: z.string().max(80).optional().nullable(),
  qualificationSummary: z.string().max(2000).optional().nullable(),
  stationId: z.string().uuid().optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  incidentEligible: z.boolean().default(true),
});

export const createOccupancyInputSchema = z.object({
  name: z.string().min(1).max(300),
  addressLine1: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(64).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  primaryContact: z.string().max(200).optional().nullable(),
  occupancyType: z.string().max(120).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  preplanId: z.string().uuid().optional().nullable(),
});

export const createPreplanInputSchema = z.object({
  occupancyId: z.string().uuid(),
  versionLabel: z.string().min(1).max(64).default("1"),
  approvalStatus: z.enum(["DRAFT", "APPROVED", "SUPERSEDED"]).default("DRAFT"),
  tacticalSummary: z.string().max(8000).optional().nullable(),
  hazards: z.string().max(8000).optional().nullable(),
  accessNotes: z.string().max(8000).optional().nullable(),
  utilityNotes: z.string().max(8000).optional().nullable(),
  primaryStationId: z.string().uuid().optional().nullable(),
});

export const createIncidentInputSchema = z.object({
  incidentNumber: z.string().min(1).max(64).optional(),
  manualNumber: z.boolean().default(false),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  alarmAt: z.string().datetime().optional().nullable(),
  stationId: z.string().uuid().optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  responseDistrict: z.string().max(120).optional().nullable(),
  incidentSource: z.string().max(64).optional().nullable(),
  dispatchDescription: z.string().max(4000).optional().nullable(),
  mutualAidStatus: z.string().max(64).optional().nullable(),
  aidDirection: z.string().max(64).optional().nullable(),
  incidentCommanderPersonnelId: z.string().uuid().optional().nullable(),
  reportOwnerUserId: z.string().uuid().optional().nullable(),
  primaryIncidentTypeCode: z.string().max(120).optional().nullable(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>;

export const patchIncidentInputSchema = z.object({
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  alarmAt: z.string().datetime().optional().nullable(),
  stationId: z.string().uuid().optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  responseDistrict: z.string().max(120).optional().nullable(),
  incidentSource: z.string().max(64).optional().nullable(),
  dispatchDescription: z.string().max(4000).optional().nullable(),
  mutualAidStatus: z.string().max(64).optional().nullable(),
  aidDirection: z.string().max(64).optional().nullable(),
  incidentCommanderPersonnelId: z.string().uuid().optional().nullable(),
  reportOwnerUserId: z.string().uuid().optional().nullable(),
  primaryIncidentTypeCode: z.string().max(120).optional().nullable(),
  secondaryIncidentTypeCodes: z.array(z.string().max(120)).max(20).optional(),
});

export const upsertFieldValueInputSchema = z.object({
  fieldId: z.string().uuid(),
  sectionKey: z.string().min(1).max(64),
  repeatableItemId: z.string().uuid().optional().nullable(),
  valueText: z.string().max(16000).optional().nullable(),
  valueNumber: z.number().optional().nullable(),
  valueBoolean: z.boolean().optional().nullable(),
  valueTimestamp: z.string().datetime().optional().nullable(),
  valueOptionId: z.string().uuid().optional().nullable(),
  valueJson: z.unknown().optional().nullable(),
  prefillSource: z.enum(PREFILL_SOURCES).optional().nullable(),
  userConfirmed: z.boolean().optional(),
});

export const batchUpsertFieldValuesInputSchema = z.object({
  values: z.array(upsertFieldValueInputSchema).min(1).max(200),
});

export const submitReviewInputSchema = z.object({
  note: z.string().max(4000).optional().nullable(),
  reviewerUserId: z.string().uuid().optional().nullable(),
});

export const returnIncidentInputSchema = z.object({
  reason: z.string().min(1).max(4000),
  comments: z
    .array(
      z.object({
        sectionKey: z.string().max(64).optional().nullable(),
        fieldId: z.string().uuid().optional().nullable(),
        body: z.string().min(1).max(4000),
      }),
    )
    .max(50)
    .default([]),
});

export const voidIncidentInputSchema = z.object({
  reason: z.string().min(1).max(4000),
});

export const SPECIALTY_REVIEWER_ROLES = [
  "FIRE_INVESTIGATOR",
  "HAZMAT_OFFICER",
  "SAFETY_OFFICER",
  "PREVENTION_OFFICER",
  "TRAINING_OFFICER",
] as const;

export const reviewCommentInputSchema = z.object({
  sectionKey: z.string().max(64).optional().nullable(),
  fieldId: z.string().uuid().optional().nullable(),
  specialtyRecordType: z.string().max(64).optional().nullable(),
  specialtyRecordId: z.string().uuid().optional().nullable(),
  attachmentId: z.string().uuid().optional().nullable(),
  validationResultId: z.string().uuid().optional().nullable(),
  reviewerRole: z.enum(SPECIALTY_REVIEWER_ROLES).optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  body: z.string().min(1).max(4000),
});

export const resolveReviewCommentInputSchema = z.object({
  resolutionNote: z.string().max(2000).optional().nullable(),
});

export const reopenReviewCommentInputSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
});

export const returnSpecialtySectionInputSchema = z.object({
  sectionKey: z.string().min(1).max(64),
  reason: z.string().min(1).max(4000),
  specialtyRecordType: z.string().max(64).optional().nullable(),
  specialtyRecordId: z.string().uuid().optional().nullable(),
  reviewerRole: z.enum(SPECIALTY_REVIEWER_ROLES).optional().nullable(),
});

export const ATTACHMENT_CATEGORIES = [
  "SCENE_PHOTO",
  "FIRE_PHOTO",
  "HAZMAT_PHOTO",
  "RESCUE_PHOTO",
  "EXPLOSION_PHOTO",
  "EXPOSURE_PHOTO",
  "ALARM_DOCUMENT",
  "FIRE_PROTECTION_DOCUMENT",
  "INVESTIGATION_REFERRAL",
  "SKETCH",
  "FLOOR_PLAN",
  "PDF",
  "OTHER",
] as const;

export const initializeAttachmentUploadInputSchema = z.object({
  specialtySection: z.string().max(64).optional().nullable(),
  repeatableRecordType: z.string().max(64).optional().nullable(),
  repeatableRecordId: z.string().uuid().optional().nullable(),
  category: z.enum(ATTACHMENT_CATEGORIES).default("OTHER"),
  caption: z.string().max(2000).optional().nullable(),
  originalFilename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional()
    .nullable(),
  captureAt: z.string().datetime().optional().nullable(),
  source: z.enum(["RMS_WEB", "MOBILE_CAMERA", "IMPORT"]).default("RMS_WEB"),
  securityClassification: z.enum(["INTERNAL", "RESTRICTED", "PUBLIC_SAFETY"]).default("INTERNAL"),
});

export const completeAttachmentUploadInputSchema = z.object({
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional()
    .nullable(),
});

export const patchAttachmentInputSchema = z.object({
  category: z.enum(ATTACHMENT_CATEGORIES).optional(),
  caption: z.string().max(2000).optional().nullable(),
  specialtySection: z.string().max(64).optional().nullable(),
});

export const createExposureInputSchema = z.object({
  addressLine1: z.string().max(300).optional().nullable(),
  addressLine2: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(64).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
  locationDescription: z.string().max(4000).optional().nullable(),
  locationExceptionNote: z.string().max(2000).optional().nullable(),
  occupancyId: z.string().uuid().optional().nullable(),
  preplanId: z.string().uuid().optional().nullable(),
  propertyUse: z.string().max(120).optional().nullable(),
  constructionDetails: z.string().max(4000).optional().nullable(),
  fireSpreadMechanism: z.string().max(120).optional().nullable(),
  fireOriginRelationship: z.string().max(120).optional().nullable(),
  damageDescription: z.string().max(4000).optional().nullable(),
  propertyLoss: z.number().nonnegative().optional().nullable(),
  contentLoss: z.number().nonnegative().optional().nullable(),
  propertyValue: z.number().nonnegative().optional().nullable(),
  contentValue: z.number().nonnegative().optional().nullable(),
  lossExceptionNote: z.string().max(2000).optional().nullable(),
  suppressionActions: z.string().max(4000).optional().nullable(),
  alarmSystemsSummary: z.string().max(4000).optional().nullable(),
  protectionSystemsSummary: z.string().max(4000).optional().nullable(),
  civilianCasualtyCount: z.number().int().nonnegative().optional(),
  fireServiceCasualtyCount: z.number().int().nonnegative().optional(),
  narrative: z.string().max(20_000).optional().nullable(),
});

export const patchExposureInputSchema = createExposureInputSchema.partial().extend({
  completionStatus: z.enum(["INCOMPLETE", "COMPLETE", "NOT_APPLICABLE"]).optional(),
});

export const createCivilianCasualtyInputSchema = z.object({
  exposureId: z.string().uuid().optional().nullable(),
  personKnown: z.boolean().default(false),
  displayName: z.string().max(200).optional().nullable(),
  age: z.number().int().min(0).max(120).optional().nullable(),
  ageRange: z.string().max(40).optional().nullable(),
  sex: z.string().max(40).optional().nullable(),
  civilianRole: z.string().max(80).optional().nullable(),
  relationshipToProperty: z.string().max(120).optional().nullable(),
  locationAtInjury: z.string().max(2000).optional().nullable(),
  locationFound: z.string().max(2000).optional().nullable(),
  activityAtInjury: z.string().max(120).optional().nullable(),
  injuryCause: z.string().max(120).optional().nullable(),
  injuryType: z.string().max(120).optional().nullable(),
  injurySeverity: z.string().max(80).optional().nullable(),
  conditionAtArrival: z.string().max(120).optional().nullable(),
  rescueInvolvement: z.boolean().optional(),
  contributingFactors: z.string().max(4000).optional().nullable(),
  mobilityLimitations: z.string().max(2000).optional().nullable(),
  evacuationLimitations: z.string().max(2000).optional().nullable(),
  protectiveEquipment: z.string().max(2000).optional().nullable(),
  smokeAlarmAwareness: z.string().max(80).optional().nullable(),
  treatmentProvided: z.string().max(4000).optional().nullable(),
  transportStatus: z.string().max(80).optional().nullable(),
  destinationReference: z.string().max(200).optional().nullable(),
  transportExceptionNote: z.string().max(2000).optional().nullable(),
  outcome: z.string().max(80).optional().nullable(),
  fatality: z.boolean().optional(),
  epcrEncounterRef: z.string().max(120).optional().nullable(),
  narrative: z.string().max(20_000).optional().nullable(),
  unknownPersonHandling: z.string().max(80).optional().nullable(),
});

export const patchCivilianCasualtyInputSchema = createCivilianCasualtyInputSchema.partial();

export const createFireServiceCasualtyInputSchema = z.object({
  exposureId: z.string().uuid().optional().nullable(),
  personnelId: z.string().uuid().optional().nullable(),
  personnelDisplayName: z.string().max(200).optional().nullable(),
  personnelUnknownException: z.string().max(2000).optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  assignment: z.string().max(120).optional().nullable(),
  rank: z.string().max(80).optional().nullable(),
  incidentActivity: z.string().max(120).optional().nullable(),
  injuryLocation: z.string().max(2000).optional().nullable(),
  injuryType: z.string().max(120).optional().nullable(),
  injurySeverity: z.string().max(80).optional().nullable(),
  exposureCategory: z.string().max(120).optional().nullable(),
  ppeUse: z.string().max(80).optional().nullable(),
  scbaUse: z.string().max(80).optional().nullable(),
  passStatus: z.string().max(80).optional().nullable(),
  mayday: z.boolean().optional(),
  maydayDetails: z.string().max(4000).optional().nullable(),
  rapidIntervention: z.boolean().optional(),
  equipmentFailure: z.string().max(4000).optional().nullable(),
  apparatusInvolvement: z.string().max(4000).optional().nullable(),
  treatmentStatus: z.string().max(80).optional().nullable(),
  transportStatus: z.string().max(80).optional().nullable(),
  lostTimeStatus: z.string().max(80).optional().nullable(),
  returnToDutyStatus: z.string().max(80).optional().nullable(),
  contributingFactors: z.string().max(4000).optional().nullable(),
  nearMissClassification: z.string().max(80).optional().nullable(),
  followUpRequirements: z.string().max(4000).optional().nullable(),
  narrative: z.string().max(20_000).optional().nullable(),
});

export const patchFireServiceCasualtyInputSchema = createFireServiceCasualtyInputSchema.partial();

export const createHazmatSubstanceInputSchema = z.object({
  productName: z.string().min(1).max(200),
  unNaNumber: z.string().max(32).optional().nullable(),
  casNumber: z.string().max(40).optional().nullable(),
  hazardClass: z.string().max(80).optional().nullable(),
  physicalState: z.string().max(40).optional().nullable(),
  quantityReleased: z.number().nonnegative().optional().nullable(),
  quantityThreatened: z.number().nonnegative().optional().nullable(),
  unitOfMeasure: z.string().max(40).optional().nullable(),
  releaseStatus: z.string().max(80).optional().nullable(),
  exposureRoutes: z.array(z.string().max(80)).max(20).optional(),
  environmentalImpact: z.string().max(4000).optional().nullable(),
  waterwayImpact: z.string().max(4000).optional().nullable(),
  responsibleParty: z.string().max(4000).optional().nullable(),
  narrative: z.string().max(20_000).optional().nullable(),
});

export const patchHazmatSubstanceInputSchema = createHazmatSubstanceInputSchema.partial();

export const createHazmatContainerInputSchema = z.object({
  substanceId: z.string().uuid().optional().nullable(),
  containerType: z.string().min(1).max(120),
  capacity: z.number().nonnegative().optional().nullable(),
  capacityUnit: z.string().max(40).optional().nullable(),
  productName: z.string().max(200).optional().nullable(),
  damage: z.string().max(4000).optional().nullable(),
  leakLocation: z.string().max(120).optional().nullable(),
  pressureStatus: z.string().max(80).optional().nullable(),
  controlAction: z.string().max(4000).optional().nullable(),
  recoveryStatus: z.string().max(80).optional().nullable(),
  disposalStatus: z.string().max(80).optional().nullable(),
  narrative: z.string().max(20_000).optional().nullable(),
});

export const patchHazmatContainerInputSchema = createHazmatContainerInputSchema.partial();

export const createAlarmSystemInputSchema = z.object({
  exposureId: z.string().uuid().optional().nullable(),
  systemType: z.string().max(80).default("ALARM"),
  deviceType: z.string().max(120).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  presence: z.string().max(40).optional().nullable(),
  activation: z.string().max(80).optional().nullable(),
  operation: z.string().max(80).optional().nullable(),
  effectiveness: z.string().max(80).optional().nullable(),
  impairment: z.boolean().optional(),
  failureReason: z.string().max(4000).optional().nullable(),
  numberActivated: z.number().int().nonnegative().optional().nullable(),
  numberActivatedUnknown: z.boolean().optional(),
  manualIntervention: z.boolean().optional(),
  contractor: z.string().max(200).optional().nullable(),
  correctiveAction: z.string().max(4000).optional().nullable(),
  inspectionReferral: z.string().max(4000).optional().nullable(),
  reviewComments: z.string().max(4000).optional().nullable(),
});

export const patchAlarmSystemInputSchema = createAlarmSystemInputSchema.partial();

export const createProtectionSystemInputSchema = z.object({
  exposureId: z.string().uuid().optional().nullable(),
  systemType: z.string().min(1).max(80),
  location: z.string().max(200).optional().nullable(),
  presence: z.string().max(40).optional().nullable(),
  activation: z.string().max(80).optional().nullable(),
  operation: z.string().max(80).optional().nullable(),
  effectiveness: z.string().max(80).optional().nullable(),
  impairment: z.boolean().optional(),
  failureReason: z.string().max(4000).optional().nullable(),
  numberActivated: z.number().int().nonnegative().optional().nullable(),
  numberActivatedUnknown: z.boolean().optional(),
  manualIntervention: z.boolean().optional(),
  contractor: z.string().max(200).optional().nullable(),
  correctiveAction: z.string().max(4000).optional().nullable(),
  inspectionReferral: z.string().max(4000).optional().nullable(),
  reviewComments: z.string().max(4000).optional().nullable(),
});

export const patchProtectionSystemInputSchema = createProtectionSystemInputSchema.partial();

export const createOccupancyLinkInputSchema = z.object({
  exposureId: z.string().uuid().optional().nullable(),
  occupancyId: z.string().uuid().optional().nullable(),
  preplanId: z.string().uuid().optional().nullable(),
  prefillSource: z.enum(["OCCUPANCY", "PREPLAN", "MANUAL"]).default("OCCUPANCY"),
  incidentCorrectionsJson: z.record(z.unknown()).optional(),
});

export const createProposedMasterUpdateInputSchema = z.object({
  targetType: z.enum(["OCCUPANCY", "PREPLAN"]),
  targetId: z.string().uuid(),
  proposedChangesJson: z.record(z.unknown()),
});

export const reviewProposedMasterUpdateInputSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED", "APPLIED"]),
  reviewNote: z.string().max(4000).optional().nullable(),
});

export const sectionApprovalInputSchema = z.object({
  sectionKey: z.string().min(1).max(64),
  reviewerRole: z.enum(SPECIALTY_REVIEWER_ROLES).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const duplicateCheckInputSchema = z.object({
  incidentNumber: z.string().max(64).optional(),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  alarmAt: z.string().datetime().optional(),
  addressLine1: z.string().max(300).optional(),
  dispatchDescription: z.string().max(4000).optional(),
  unitIds: z.array(z.string().uuid()).max(20).optional(),
});

export const upsertNarrativeInputSchema = z.object({
  body: z.string().max(100_000),
  templateKey: z.string().max(64).optional().nullable(),
});

export const createIncidentUnitInputSchema = z.object({
  unitId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  unitRole: z.string().max(80).optional().nullable(),
  dispatchedAt: z.string().datetime().optional().nullable(),
  enRouteAt: z.string().datetime().optional().nullable(),
  arrivedAt: z.string().datetime().optional().nullable(),
  clearedAt: z.string().datetime().optional().nullable(),
});

export const patchIncidentUnitInputSchema = createIncidentUnitInputSchema
  .partial()
  .omit({ unitId: true });

export const createIncidentPersonnelInputSchema = z.object({
  personnelId: z.string().uuid(),
  unitAssignmentId: z.string().uuid().optional().nullable(),
  role: z.string().max(80).optional().nullable(),
  rank: z.string().max(80).optional().nullable(),
  primaryAction: z.string().max(120).optional().nullable(),
  exposureInvolved: z.boolean().default(false),
  isIncidentCommander: z.boolean().default(false),
  isReportingOfficer: z.boolean().default(false),
});

export const patchIncidentPersonnelInputSchema = createIncidentPersonnelInputSchema
  .partial()
  .omit({ personnelId: true });

export const prefillQuerySchema = z.object({
  stationId: z.string().uuid().optional(),
  personnelId: z.string().uuid().optional(),
  occupancyId: z.string().uuid().optional(),
  preplanId: z.string().uuid().optional(),
});

export const RMS_DEPARTMENT_ADMIN_PERMISSIONS = [
  ...ADMIN_BASE_FOR_RMS(),
  ...RMS_PERMISSIONS.filter((p) => p !== "rms.cad.raw_payload.view_restricted"),
] as const;

function ADMIN_BASE_FOR_RMS(): readonly string[] {
  return [
    "platform.tenant.read",
    "platform.tenant.update",
    "platform.organization.read",
    "platform.organization.create",
    "platform.person.read",
    "platform.person.create",
    "platform.person.update",
    "platform.user.invite",
    "platform.invitation.read",
    "platform.invitation.manage",
    "platform.membership.read",
    "platform.membership.manage",
    "platform.role.assign",
    "platform.permission.read",
    "platform.audit.read",
    "platform.configuration.update",
  ];
}

export const RMS_OFFICER_PERMISSIONS = [
  "platform.tenant.read",
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.incident.create",
  "rms.neris.incident.edit",
  "rms.neris.incident.assign",
  "rms.neris.incident.submit_review",
  "rms.neris.incident.review",
  "rms.neris.incident.approve",
  "rms.neris.incident.return",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
  "rms.neris.exposure.view",
  "rms.neris.exposure.edit",
  "rms.neris.civilian_casualty.view",
  "rms.neris.civilian_casualty.edit",
  "rms.neris.fire_service_casualty.view",
  "rms.neris.hazmat.view",
  "rms.neris.hazmat.edit",
  "rms.neris.alarm_system.view",
  "rms.neris.alarm_system.edit",
  "rms.neris.protection_system.view",
  "rms.neris.protection_system.edit",
  "rms.neris.attachments.view",
  "rms.neris.attachments.upload",
  "rms.neris.attachments.archive",
  "rms.neris.specialty.review",
  "rms.masterdata.read",
  "rms.cad.view",
  "rms.cad.conflict.view",
  "rms.cad.incident.link",
  "rms.cad.incident.manual_override",
] as const;

export const RMS_MEMBER_INCIDENT_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.incident.create",
  "rms.neris.incident.edit",
  "rms.neris.incident.assign",
  "rms.neris.incident.submit_review",
  "rms.neris.validation.view",
  "rms.neris.exposure.view",
  "rms.neris.exposure.edit",
  "rms.neris.civilian_casualty.view",
  "rms.neris.civilian_casualty.edit",
  "rms.neris.hazmat.view",
  "rms.neris.hazmat.edit",
  "rms.neris.alarm_system.view",
  "rms.neris.alarm_system.edit",
  "rms.neris.protection_system.view",
  "rms.neris.protection_system.edit",
  "rms.neris.attachments.view",
  "rms.neris.attachments.upload",
  "rms.masterdata.read",
] as const;

/** Safety officer — fire-service casualty + safety review without broad unrestricted access. */
export const RMS_SAFETY_OFFICER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.fire_service_casualty.view",
  "rms.neris.fire_service_casualty.edit",
  "rms.neris.safety_review",
  "rms.neris.specialty.review",
  "rms.neris.attachments.view",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
] as const;

export const RMS_HAZMAT_OFFICER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.hazmat.view",
  "rms.neris.hazmat.edit",
  "rms.neris.specialty.review",
  "rms.neris.attachments.view",
  "rms.neris.attachments.upload",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
] as const;

export const RMS_FIRE_INVESTIGATOR_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.exposure.view",
  "rms.neris.specialty.review",
  "rms.neris.attachments.view",
  "rms.neris.attachments.upload",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
  "rms.masterdata.read",
] as const;

export const RMS_PREVENTION_OFFICER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.alarm_system.view",
  "rms.neris.protection_system.view",
  "rms.neris.specialty.review",
  "rms.neris.attachments.view",
  "rms.neris.audit.view",
  "rms.masterdata.read",
  "rms.masterdata.manage",
] as const;

export const RMS_TRAINING_OFFICER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "rms.neris.incident.view",
  "rms.neris.specialty.review",
  "rms.neris.attachments.view",
  "rms.neris.validation.view",
  "rms.neris.audit.view",
] as const;
