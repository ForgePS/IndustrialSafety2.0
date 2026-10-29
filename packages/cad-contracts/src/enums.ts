/** CAD intake modes (tenant-level). Aligns with tenant_neris_configuration.operating_mode. */
export const CAD_INTAKE_MODES = ["MANUAL_ONLY", "CAD_ENABLED", "HYBRID"] as const;
export type CadIntakeMode = (typeof CAD_INTAKE_MODES)[number];

export const CAD_CONNECTION_STATUSES = [
  "DRAFT",
  "CONFIGURED",
  "TESTING",
  "ACTIVE",
  "DEGRADED",
  "DISABLED",
  "ERROR",
  "ARCHIVED",
] as const;
export type CadConnectionStatus = (typeof CAD_CONNECTION_STATUSES)[number];

export const CAD_HEALTH_STATUSES = ["UNKNOWN", "HEALTHY", "DEGRADED", "UNHEALTHY"] as const;
export type CadHealthStatus = (typeof CAD_HEALTH_STATUSES)[number];

export const CAD_ENVIRONMENTS = [
  "SIMULATOR",
  "DEVELOPMENT",
  "TEST",
  "STAGING",
  "PRODUCTION",
] as const;
export type CadEnvironment = (typeof CAD_ENVIRONMENTS)[number];

export const CAD_TRANSPORT_TYPES = [
  "HTTPS_WEBHOOK",
  "POLLING",
  "SYNTHETIC_SIMULATOR",
  "SFTP",
  "SECURE_FILE_DROP",
  "MESSAGE_BROKER",
  "VENDOR_SOCKET_GATEWAY",
  "CUSTOMER_MIDDLEWARE_GATEWAY",
  "MANUAL_CAD_EXPORT_UPLOAD",
] as const;
export type CadTransportType = (typeof CAD_TRANSPORT_TYPES)[number];

/** Transports implemented in Phase 4. Others are NOT_IMPLEMENTED. */
export const CAD_IMPLEMENTED_TRANSPORTS = [
  "HTTPS_WEBHOOK",
  "POLLING",
  "SYNTHETIC_SIMULATOR",
] as const satisfies readonly CadTransportType[];

export const CAD_TRANSPORT_IMPLEMENTATION_STATUS = {
  HTTPS_WEBHOOK: "IMPLEMENTED",
  POLLING: "IMPLEMENTED",
  SYNTHETIC_SIMULATOR: "IMPLEMENTED",
  SFTP: "NOT_IMPLEMENTED",
  SECURE_FILE_DROP: "NOT_IMPLEMENTED",
  MESSAGE_BROKER: "NOT_IMPLEMENTED",
  VENDOR_SOCKET_GATEWAY: "NOT_IMPLEMENTED",
  CUSTOMER_MIDDLEWARE_GATEWAY: "NOT_IMPLEMENTED",
  MANUAL_CAD_EXPORT_UPLOAD: "NOT_IMPLEMENTED",
} as const satisfies Record<CadTransportType, "IMPLEMENTED" | "NOT_IMPLEMENTED">;

export const CAD_RAW_PROCESSING_STATUSES = [
  "RECEIVED",
  "AUTHENTICATING",
  "REJECTED_AUTHENTICATION",
  "VALIDATING",
  "REJECTED_VALIDATION",
  "PERSISTED",
  "QUEUED",
  "NORMALIZING",
  "NORMALIZED",
  "MATCHING",
  "APPLYING",
  "APPLIED",
  "DUPLICATE",
  "REQUIRES_REVIEW",
  "QUARANTINED",
  "FAILED",
  "DEAD_LETTER",
] as const;
export type CadRawProcessingStatus = (typeof CAD_RAW_PROCESSING_STATUSES)[number];

export const CAD_AUTHENTICATION_STATUSES = [
  "NOT_EVALUATED",
  "VALID",
  "INVALID",
  "EXPIRED",
  "REPLAYED",
  "MISSING",
  "ERROR",
] as const;
export type CadAuthenticationStatus = (typeof CAD_AUTHENTICATION_STATUSES)[number];

export const CAD_NORMALIZED_EVENT_TYPES = [
  "INCIDENT_CREATED",
  "INCIDENT_UPDATED",
  "INCIDENT_CANCELLED",
  "INCIDENT_REOPENED",
  "UNIT_ASSIGNED",
  "UNIT_DISPATCHED",
  "UNIT_EN_ROUTE",
  "UNIT_ARRIVED",
  "UNIT_STAGED",
  "UNIT_AT_PATIENT",
  "UNIT_TRANSPORTING",
  "UNIT_AT_DESTINATION",
  "UNIT_CLEARED",
  "UNIT_CANCELLED",
  "PERSONNEL_UPDATED",
  "LOCATION_UPDATED",
  "INCIDENT_TYPE_UPDATED",
  "PRIORITY_UPDATED",
  "COMMENT_ADDED",
  "DISPOSITION_UPDATED",
  "INCIDENT_CONTROLLED",
  "INCIDENT_CLOSED",
  "HEARTBEAT",
  "CONNECTION_TEST",
  "UNKNOWN_EVENT",
] as const;
export type CadNormalizedEventType = (typeof CAD_NORMALIZED_EVENT_TYPES)[number];

export const CAD_MAPPING_PROFILE_STATUSES = [
  "DRAFT",
  "TESTING",
  "PUBLISHED",
  "DEPRECATED",
  "ARCHIVED",
] as const;
export type CadMappingProfileStatus = (typeof CAD_MAPPING_PROFILE_STATUSES)[number];

export const CAD_TRANSFORMATION_TYPES = [
  "DIRECT",
  "LOOKUP",
  "CONCATENATE",
  "DATE_TIME_PARSE",
  "TIMEZONE_CONVERT",
  "BOOLEAN",
  "NUMBER",
  "UNIT_NORMALIZE",
  "ADDRESS_PARSE",
  "COORDINATE_PARSE",
  "CODE_TRANSLATE",
  "CONDITIONAL",
  "FALLBACK",
  "IGNORE",
] as const;
export type CadTransformationType = (typeof CAD_TRANSFORMATION_TYPES)[number];

export const CAD_UNKNOWN_BEHAVIORS = [
  "PRESERVE",
  "QUEUE_FOR_MAPPING",
  "USE_DEFAULT",
  "REJECT",
  "WARN",
  "IGNORE_WITH_REASON",
] as const;
export type CadUnknownBehavior = (typeof CAD_UNKNOWN_BEHAVIORS)[number];

export const CAD_VALUE_SOURCES = [
  "CAD",
  "MANUAL",
  "MASTER_DATA",
  "DERIVED",
  "SYSTEM",
  "IMPORT",
] as const;
export type CadValueSource = (typeof CAD_VALUE_SOURCES)[number];

export const CAD_OWNERSHIP_POLICIES = [
  "CAD_AUTHORITATIVE",
  "MANUAL_AUTHORITATIVE",
  "CAD_UNTIL_MANUAL_EDIT",
  "CAD_UNTIL_REVIEW",
  "LATEST_TIMESTAMP",
  "APPEND_ONLY",
  "REQUIRES_RECONCILIATION",
  "NEVER_OVERWRITE",
] as const;
export type CadOwnershipPolicy = (typeof CAD_OWNERSHIP_POLICIES)[number];

export const CAD_UPDATE_CUTOFF_POLICIES = [
  "UNTIL_INCIDENT_CLOSED",
  "UNTIL_OFFICER_REVIEW",
  "UNTIL_FINALIZED",
  "FIXED_TIME_AFTER_CLEAR",
  "MANUAL_STOP",
] as const;
export type CadUpdateCutoffPolicy = (typeof CAD_UPDATE_CUTOFF_POLICIES)[number];

export const CAD_ACK_OUTCOMES = [
  "ACCEPTED",
  "DUPLICATE",
  "REJECTED_AUTHENTICATION",
  "REJECTED_VALIDATION",
  "UNSUPPORTED_VERSION",
  "PROCESSING_ERROR",
] as const;
export type CadAckOutcome = (typeof CAD_ACK_OUTCOMES)[number];

export const CAD_MATCH_OUTCOMES = [
  "CREATE_NEW",
  "UPDATE_EXISTING",
  "LINK_TO_MANUAL",
  "POSSIBLE_DUPLICATE",
  "REQUIRES_REVIEW",
  "REJECT",
] as const;
export type CadMatchOutcome = (typeof CAD_MATCH_OUTCOMES)[number];

export const CAD_LINK_STATUSES = ["ACTIVE", "SUSPENDED", "UNLINKED", "CLOSED", "CONFLICT"] as const;
export type CadLinkStatus = (typeof CAD_LINK_STATUSES)[number];

export const CAD_LINK_METHODS = ["AUTOMATIC", "MANUAL", "HYBRID_MATCH", "IMPORT"] as const;
export type CadLinkMethod = (typeof CAD_LINK_METHODS)[number];

export const CAD_CONFLICT_TYPES = [
  "VALUE_CONFLICT",
  "TIME_CONFLICT",
  "LOCATION_CONFLICT",
  "UNIT_CONFLICT",
  "PERSONNEL_CONFLICT",
  "INCIDENT_TYPE_CONFLICT",
  "PRIORITY_CONFLICT",
  "FINALIZED_RECORD_CONFLICT",
  "DUPLICATE_INCIDENT",
  "OUT_OF_ORDER_EVENT",
  "UNMAPPED_VALUE",
  "UNKNOWN_UNIT",
  "UNKNOWN_PERSONNEL",
  "INVALID_MAPPING",
  "MANUAL_OVERRIDE_CONFLICT",
  "AMBIGUOUS_MATCH",
] as const;
export type CadConflictType = (typeof CAD_CONFLICT_TYPES)[number];

export const CAD_CONFLICT_STATUSES = [
  "OPEN",
  "AUTO_RESOLVED",
  "MANUALLY_RESOLVED",
  "IGNORED_WITH_REASON",
  "ESCALATED",
] as const;
export type CadConflictStatus = (typeof CAD_CONFLICT_STATUSES)[number];

export const CAD_RESOLUTION_ACTIONS = [
  "USE_CAD",
  "KEEP_FORGE",
  "MERGE",
  "LINK",
  "UNLINK",
  "CREATE_NEW",
  "IGNORE",
  "ESCALATE",
  "CORRECT_MAPPING",
] as const;
export type CadResolutionAction = (typeof CAD_RESOLUTION_ACTIONS)[number];

export const CAD_AUDIT_ACTIONS = {
  CONNECTION_CREATED: "CAD_CONNECTION_CREATED",
  CONNECTION_UPDATED: "CAD_CONNECTION_UPDATED",
  CONNECTION_TESTED: "CAD_CONNECTION_TESTED",
  CONNECTION_ENABLED: "CAD_CONNECTION_ENABLED",
  CONNECTION_DISABLED: "CAD_CONNECTION_DISABLED",
  SECRET_ROTATED: "CAD_SECRET_ROTATED",
  MESSAGE_RECEIVED: "CAD_MESSAGE_RECEIVED",
  MESSAGE_REJECTED: "CAD_MESSAGE_REJECTED",
  MESSAGE_REPROCESSED: "CAD_MESSAGE_REPROCESSED",
  MESSAGE_QUARANTINED: "CAD_MESSAGE_QUARANTINED",
  EVENT_NORMALIZED: "CAD_EVENT_NORMALIZED",
  EVENT_APPLIED: "CAD_EVENT_APPLIED",
  EVENT_DUPLICATE: "CAD_EVENT_DUPLICATE",
  INCIDENT_CREATED: "CAD_INCIDENT_CREATED",
  INCIDENT_UPDATED: "CAD_INCIDENT_UPDATED",
  INCIDENT_LINKED: "CAD_INCIDENT_LINKED",
  INCIDENT_UNLINKED: "CAD_INCIDENT_UNLINKED",
  MANUAL_OVERRIDE: "CAD_MANUAL_OVERRIDE",
  CONFLICT_CREATED: "CAD_CONFLICT_CREATED",
  CONFLICT_RESOLVED: "CAD_CONFLICT_RESOLVED",
  CONFLICT_ESCALATED: "CAD_CONFLICT_ESCALATED",
  MAPPING_CREATED: "CAD_MAPPING_CREATED",
  MAPPING_PUBLISHED: "CAD_MAPPING_PUBLISHED",
  UNMAPPED_VALUE_RESOLVED: "CAD_UNMAPPED_VALUE_RESOLVED",
  UNIT_MAPPED: "CAD_UNIT_MAPPED",
  PERSONNEL_MAPPED: "CAD_PERSONNEL_MAPPED",
  REPLAY_STARTED: "CAD_REPLAY_STARTED",
  REPLAY_COMPLETED: "CAD_REPLAY_COMPLETED",
  RAW_PAYLOAD_ACCESSED: "CAD_RAW_PAYLOAD_ACCESSED",
  FALLBACK_STARTED: "CAD_FALLBACK_STARTED",
  FALLBACK_ENDED: "CAD_FALLBACK_ENDED",
} as const;

export type CadAuditAction = (typeof CAD_AUDIT_ACTIONS)[keyof typeof CAD_AUDIT_ACTIONS];

/** Tenant CAD feature flags — default false; API-enforced. */
export const CAD_FEATURE_FLAGS = {
  ENABLED: "rms.cad.enabled",
  WEBHOOK: "rms.cad.webhook.enabled",
  POLLING: "rms.cad.polling.enabled",
  HYBRID: "rms.cad.hybrid.enabled",
  OPERATIONS: "rms.cad.operations.enabled",
  RAW_PAYLOAD_ACCESS: "rms.cad.raw_payload_access.enabled",
  SIMULATOR: "rms.cad.simulator.enabled",
  ADAPTER_MANAGEMENT: "platform.cad.adapter_management.enabled",
} as const;

export type CadFeatureFlag = (typeof CAD_FEATURE_FLAGS)[keyof typeof CAD_FEATURE_FLAGS];

/** Tenant-grantable CAD permissions (excludes raw payload + creator-only). */
export const RMS_CAD_PERMISSIONS = [
  "rms.cad.view",
  "rms.cad.connection.view",
  "rms.cad.connection.manage",
  "rms.cad.connection.test",
  "rms.cad.connection.enable",
  "rms.cad.connection.disable",
  "rms.cad.connection.rotate_secret",
  "rms.cad.message.view",
  "rms.cad.message.view_restricted",
  "rms.cad.message.reprocess",
  "rms.cad.message.quarantine",
  "rms.cad.mapping.view",
  "rms.cad.mapping.manage",
  "rms.cad.mapping.publish",
  "rms.cad.unmapped.view",
  "rms.cad.unmapped.resolve",
  "rms.cad.unit_mapping.view",
  "rms.cad.unit_mapping.manage",
  "rms.cad.personnel_mapping.view",
  "rms.cad.personnel_mapping.manage",
  "rms.cad.conflict.view",
  "rms.cad.conflict.resolve",
  "rms.cad.conflict.escalate",
  "rms.cad.incident.link",
  "rms.cad.incident.unlink",
  "rms.cad.incident.manual_override",
  "rms.cad.operations.view",
  "rms.cad.replay",
  "rms.cad.dead_letter.manage",
] as const;

export type RmsCadPermission = (typeof RMS_CAD_PERMISSIONS)[number];

/** High-sensitivity; not on ordinary tenant admin templates by default. */
export const RMS_CAD_RESTRICTED_PERMISSIONS = ["rms.cad.raw_payload.view_restricted"] as const;

export type RmsCadRestrictedPermission = (typeof RMS_CAD_RESTRICTED_PERMISSIONS)[number];

/** Creator-only — not tenant-grantable. */
export const PLATFORM_CAD_PERMISSIONS = [
  "platform.cad.adapter.manage",
  "platform.cad.mapping_template.manage",
  "platform.cad.global_diagnostics.view",
] as const;

export type PlatformCadPermission = (typeof PLATFORM_CAD_PERMISSIONS)[number];

export const ALL_CAD_PERMISSIONS = [
  ...RMS_CAD_PERMISSIONS,
  ...RMS_CAD_RESTRICTED_PERMISSIONS,
  ...PLATFORM_CAD_PERMISSIONS,
] as const;
