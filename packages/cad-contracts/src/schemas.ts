import { z } from "zod";
import {
  CAD_CONNECTION_STATUSES,
  CAD_ENVIRONMENTS,
  CAD_HEALTH_STATUSES,
  CAD_INTAKE_MODES,
  CAD_TRANSPORT_TYPES,
  CAD_UPDATE_CUTOFF_POLICIES,
} from "./enums.js";

export const cadIntakeModeSchema = z.enum(CAD_INTAKE_MODES);
export const cadConnectionStatusSchema = z.enum(CAD_CONNECTION_STATUSES);
export const cadHealthStatusSchema = z.enum(CAD_HEALTH_STATUSES);
export const cadEnvironmentSchema = z.enum(CAD_ENVIRONMENTS);
export const cadTransportTypeSchema = z.enum(CAD_TRANSPORT_TYPES);
export const cadUpdateCutoffPolicySchema = z.enum(CAD_UPDATE_CUTOFF_POLICIES);

/** Tenant CAD behavioral configuration (extends NERIS overlay). */
export const tenantCadConfigurationSchema = z.object({
  intakeMode: cadIntakeModeSchema.default("MANUAL_ONLY"),
  allowManualCreationWhenCadEnabled: z.boolean().default(true),
  manualOverrideRequiresReason: z.boolean().default(true),
  manualOverridePermission: z.string().min(1).default("rms.cad.incident.manual_override"),
  cadUpdateCutoffPolicy: cadUpdateCutoffPolicySchema.default("UNTIL_FINALIZED"),
  duplicateMatchThreshold: z.number().min(0).max(100).default(95),
  possibleDuplicateThreshold: z.number().min(0).max(100).default(70),
  autoLinkThreshold: z.number().min(0).max(100).default(90),
  requireMatchReview: z.boolean().default(true),
  preserveCadComments: z.boolean().default(true),
  callerDataRetentionDays: z.number().int().positive().max(3650).default(90),
  rawPayloadRetentionDays: z.number().int().positive().max(3650).default(180),
  cadQuietHoursJson: z.record(z.unknown()).nullable().optional(),
  cadExpectedOperatingWindowJson: z.record(z.unknown()).nullable().optional(),
});

export type TenantCadConfiguration = z.infer<typeof tenantCadConfigurationSchema>;

export const createCadConnectionInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  vendor: z.string().min(1).max(120),
  adapterKey: z.string().min(1).max(120),
  adapterVersion: z.string().min(1).max(64),
  environment: cadEnvironmentSchema,
  transportType: cadTransportTypeSchema,
  intakeMode: cadIntakeModeSchema.optional(),
  configurationJson: z.record(z.unknown()).default({}),
  mappingProfileId: z.string().uuid().optional().nullable(),
  pollingIntervalSeconds: z.number().int().min(30).max(3600).optional().nullable(),
  expectedOperatingWindowJson: z.record(z.unknown()).optional().nullable(),
  quietHoursJson: z.record(z.unknown()).optional().nullable(),
});

export type CreateCadConnectionInput = z.infer<typeof createCadConnectionInputSchema>;

export const patchCadConnectionInputSchema = createCadConnectionInputSchema.partial().extend({
  recordVersion: z.number().int().positive(),
  status: cadConnectionStatusSchema.optional(),
});

export type PatchCadConnectionInput = z.infer<typeof patchCadConnectionInputSchema>;
