import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { nerisIncidents } from "./neris-incidents.js";
import { tenants } from "./tenants.js";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const cadMappingProfiles = pgTable(
  "cad_mapping_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    vendor: varchar("vendor", { length: 120 }).notNull(),
    adapterKey: varchar("adapter_key", { length: 120 }).notNull(),
    sourceVersion: varchar("source_version", { length: 64 }).notNull().default("*"),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    currentVersion: integer("current_version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("cad_mapping_profiles_tenant_idx").on(table.tenantId),
    index("cad_mapping_profiles_adapter_idx").on(table.adapterKey, table.status),
  ],
);

export const cadConnections = pgTable(
  "cad_connections",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    publicId: varchar("public_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    vendor: varchar("vendor", { length: 120 }).notNull(),
    adapterKey: varchar("adapter_key", { length: 120 }).notNull(),
    adapterVersion: varchar("adapter_version", { length: 64 }).notNull(),
    environment: varchar("environment", { length: 32 }).notNull(),
    transportType: varchar("transport_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    intakeMode: varchar("intake_mode", { length: 32 }).notNull().default("MANUAL_ONLY"),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    mappingProfileId: uuid("mapping_profile_id").references(() => cadMappingProfiles.id),
    credentialsSecretArn: text("credentials_secret_arn"),
    webhookSecretArn: text("webhook_secret_arn"),
    webhookKeyId: varchar("webhook_key_id", { length: 64 }),
    pollingIntervalSeconds: integer("polling_interval_seconds"),
    pollingCursor: text("polling_cursor"),
    pollingWatermark: timestamp("polling_watermark", { withTimezone: true }),
    expectedOperatingWindowJson: jsonb("expected_operating_window_json"),
    quietHoursJson: jsonb("quiet_hours_json"),
    healthStatus: varchar("health_status", { length: 32 }).notNull().default("UNKNOWN"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    lastErrorSummary: text("last_error_summary"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id").notNull(),
    updatedByUserId: uuid("updated_by_user_id").notNull(),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_connections_tenant_name_uidx").on(table.tenantId, table.name),
    uniqueIndex("cad_connections_public_id_uidx").on(table.publicId),
    index("cad_connections_tenant_status_idx").on(table.tenantId, table.status),
    index("cad_connections_tenant_health_idx").on(table.tenantId, table.healthStatus),
  ],
);

export const cadWebhookKeys = pgTable(
  "cad_webhook_keys",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    keyId: varchar("key_id", { length: 64 }).notNull(),
    secretArn: text("secret_arn").notNull(),
    role: varchar("role", { length: 32 }).notNull().default("CURRENT"),
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp("active_until", { withTimezone: true }),
    rotatedByUserId: uuid("rotated_by_user_id"),
    rotationReason: text("rotation_reason"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("cad_webhook_keys_connection_key_uidx").on(table.cadConnectionId, table.keyId),
    index("cad_webhook_keys_tenant_idx").on(table.tenantId),
  ],
);

export const cadRawMessages = pgTable(
  "cad_raw_messages",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    transportType: varchar("transport_type", { length: 64 }).notNull(),
    sourceMessageId: varchar("source_message_id", { length: 200 }),
    sourceIncidentId: varchar("source_incident_id", { length: 200 }),
    sourceEventType: varchar("source_event_type", { length: 120 }),
    sourceVersion: varchar("source_version", { length: 64 }),
    sourceSequence: bigint("source_sequence", { mode: "number" }),
    contentType: varchar("content_type", { length: 120 }),
    contentEncoding: varchar("content_encoding", { length: 64 }),
    payloadStorageType: varchar("payload_storage_type", { length: 32 }).notNull().default("S3"),
    payloadS3Bucket: varchar("payload_s3_bucket", { length: 255 }),
    payloadS3Key: varchar("payload_s3_key", { length: 1000 }),
    inlinePayloadEncrypted: bytea("inline_payload_encrypted"),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    payloadSizeBytes: bigint("payload_size_bytes", { mode: "number" }),
    idempotencyKey: varchar("idempotency_key", { length: 500 }).notNull(),
    authenticationStatus: varchar("authentication_status", { length: 32 })
      .notNull()
      .default("NOT_EVALUATED"),
    signatureValid: boolean("signature_valid"),
    replayStatus: varchar("replay_status", { length: 32 }),
    processingStatus: varchar("processing_status", { length: 40 }).notNull().default("RECEIVED"),
    processingAttempts: integer("processing_attempts").notNull().default(0),
    currentProcessingStage: varchar("current_processing_stage", { length: 64 }),
    lastProcessingErrorCode: varchar("last_processing_error_code", { length: 80 }),
    lastProcessingErrorSummary: text("last_processing_error_summary"),
    acknowledgementStatus: varchar("acknowledgement_status", { length: 40 }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("cad_raw_messages_idempotency_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.idempotencyKey,
    ),
    index("cad_raw_messages_tenant_received_idx").on(table.tenantId, table.receivedAt),
    index("cad_raw_messages_tenant_status_idx").on(table.tenantId, table.processingStatus),
  ],
);

export const cadNormalizedEvents = pgTable(
  "cad_normalized_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    cadRawMessageId: uuid("cad_raw_message_id")
      .notNull()
      .references(() => cadRawMessages.id),
    adapterKey: varchar("adapter_key", { length: 120 }).notNull(),
    adapterVersion: varchar("adapter_version", { length: 64 }).notNull(),
    mappingProfileId: uuid("mapping_profile_id").references(() => cadMappingProfiles.id),
    mappingProfileVersion: integer("mapping_profile_version"),
    sourceMessageId: varchar("source_message_id", { length: 200 }),
    sourceIncidentId: varchar("source_incident_id", { length: 200 }),
    sourceIncidentNumber: varchar("source_incident_number", { length: 120 }),
    sourceEventId: varchar("source_event_id", { length: 200 }),
    sourceSequence: bigint("source_sequence", { mode: "number" }),
    normalizedEventType: varchar("normalized_event_type", { length: 64 }).notNull(),
    normalizedEventTimestamp: timestamp("normalized_event_timestamp", {
      withTimezone: true,
    }).notNull(),
    originalEventTimestamp: text("original_event_timestamp"),
    originalTimezone: varchar("original_timezone", { length: 64 }),
    normalizedPayload: jsonb("normalized_payload").notNull(),
    normalizationWarnings: jsonb("normalization_warnings"),
    normalizationErrors: jsonb("normalization_errors"),
    mappingStatus: varchar("mapping_status", { length: 40 }),
    incidentApplicationStatus: varchar("incident_application_status", { length: 40 }),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("cad_normalized_events_tenant_ts_idx").on(table.tenantId, table.normalizedEventTimestamp),
    index("cad_normalized_events_raw_idx").on(table.cadRawMessageId),
  ],
);

export const cadComments = pgTable(
  "cad_comments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    cadNormalizedEventId: uuid("cad_normalized_event_id").references(() => cadNormalizedEvents.id),
    incidentId: uuid("incident_id").references(() => nerisIncidents.id),
    sourceCommentId: varchar("source_comment_id", { length: 200 }),
    sourceSequence: bigint("source_sequence", { mode: "number" }),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
    normalizedTimestamp: timestamp("normalized_timestamp", { withTimezone: true }),
    category: varchar("category", { length: 80 }),
    authorOrSource: varchar("author_or_source", { length: 200 }),
    commentText: text("comment_text").notNull(),
    restricted: boolean("restricted").notNull().default(false),
    copiedToNarrativeAt: timestamp("copied_to_narrative_at", { withTimezone: true }),
    copiedByUserId: uuid("copied_by_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("cad_comments_incident_idx").on(
      table.tenantId,
      table.incidentId,
      table.normalizedTimestamp,
    ),
  ],
);

export const cadWebhookReplayCache = pgTable(
  "cad_webhook_replay_cache",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    nonce: varchar("nonce", { length: 200 }),
    messageId: varchar("message_id", { length: 200 }),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("cad_webhook_replay_expires_idx").on(table.expiresAt)],
);

export const cadMappingVersions = pgTable(
  "cad_mapping_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    mappingProfileId: uuid("mapping_profile_id")
      .notNull()
      .references(() => cadMappingProfiles.id),
    versionNumber: integer("version_number").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    changeSummary: text("change_summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: uuid("published_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("cad_mapping_versions_profile_version_uidx").on(
      table.mappingProfileId,
      table.versionNumber,
    ),
  ],
);

export const cadMappingRules = pgTable(
  "cad_mapping_rules",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    mappingProfileId: uuid("mapping_profile_id")
      .notNull()
      .references(() => cadMappingProfiles.id),
    mappingVersion: integer("mapping_version").notNull().default(1),
    sourcePath: varchar("source_path", { length: 500 }),
    sourceField: varchar("source_field", { length: 200 }),
    sourceValue: text("source_value"),
    normalizedTarget: varchar("normalized_target", { length: 200 }),
    forgeTarget: varchar("forge_target", { length: 200 }),
    nerisFieldId: uuid("neris_field_id"),
    transformationType: varchar("transformation_type", { length: 40 }).notNull().default("DIRECT"),
    transformationConfig: jsonb("transformation_config"),
    defaultValue: text("default_value"),
    conditionJson: jsonb("condition_json"),
    requiredBehavior: varchar("required_behavior", { length: 40 }),
    unknownBehavior: varchar("unknown_behavior", { length: 40 })
      .notNull()
      .default("QUEUE_FOR_MAPPING"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    notes: text("notes"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("cad_mapping_rules_profile_version_idx").on(table.mappingProfileId, table.mappingVersion),
  ],
);

export const cadMappingValueAliases = pgTable(
  "cad_mapping_value_aliases",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    mappingProfileId: uuid("mapping_profile_id")
      .notNull()
      .references(() => cadMappingProfiles.id),
    mappingVersion: integer("mapping_version").notNull().default(1),
    sourceField: varchar("source_field", { length: 200 }).notNull(),
    sourceValue: text("source_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    nerisValueOptionId: uuid("neris_value_option_id"),
    notes: text("notes"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_mapping_value_aliases_uidx").on(
      table.mappingProfileId,
      table.mappingVersion,
      table.sourceField,
      table.sourceValue,
    ),
  ],
);

export const cadUnmappedValues = pgTable(
  "cad_unmapped_values",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    category: varchar("category", { length: 64 }).notNull(),
    sourceField: varchar("source_field", { length: 200 }).notNull(),
    sourceValue: text("source_value").notNull(),
    normalizedContextJson: jsonb("normalized_context_json"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    affectedMessageCount: integer("affected_message_count").notNull().default(1),
    proposedMappingJson: jsonb("proposed_mapping_json"),
    status: varchar("status", { length: 32 }).notNull().default("OPEN"),
    assignedReviewerUserId: uuid("assigned_reviewer_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionReason: text("resolution_reason"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_unmapped_values_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.category,
      table.sourceField,
      table.sourceValue,
    ),
    index("cad_unmapped_values_status_idx").on(table.tenantId, table.status, table.lastSeenAt),
  ],
);

export const cadIncidentLinks = pgTable(
  "cad_incident_links",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    sourceIncidentId: varchar("source_incident_id", { length: 200 }).notNull(),
    sourceIncidentNumber: varchar("source_incident_number", { length: 120 }),
    sourceEventId: varchar("source_event_id", { length: 200 }),
    linkStatus: varchar("link_status", { length: 32 }).notNull().default("ACTIVE"),
    linkMethod: varchar("link_method", { length: 32 }).notNull().default("AUTOMATIC"),
    matchScore: integer("match_score"),
    matchDetailsJson: jsonb("match_details_json"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    linkedByUserId: uuid("linked_by_user_id"),
    lastCadSequence: bigint("last_cad_sequence", { mode: "number" }),
    lastCadUpdateAt: timestamp("last_cad_update_at", { withTimezone: true }),
    cadUpdateCutoffPolicy: varchar("cad_update_cutoff_policy", { length: 64 })
      .notNull()
      .default("UNTIL_FINALIZED"),
    cadUpdateCutoffAt: timestamp("cad_update_cutoff_at", { withTimezone: true }),
    manualOverrideStatus: varchar("manual_override_status", { length: 40 }),
    manualOverrideReason: text("manual_override_reason"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedByUserId: uuid("suspended_by_user_id"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("cad_incident_links_incident_idx").on(table.tenantId, table.incidentId),
    index("cad_incident_links_connection_idx").on(
      table.tenantId,
      table.cadConnectionId,
      table.linkStatus,
    ),
  ],
);

export const cadConflicts = pgTable(
  "cad_conflicts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id").references(() => nerisIncidents.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    cadRawMessageId: uuid("cad_raw_message_id").references(() => cadRawMessages.id),
    cadNormalizedEventId: uuid("cad_normalized_event_id").references(() => cadNormalizedEvents.id),
    conflictType: varchar("conflict_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("OPEN"),
    fieldIdentifier: varchar("field_identifier", { length: 200 }),
    cadValueJson: jsonb("cad_value_json"),
    forgeValueJson: jsonb("forge_value_json"),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
    forgeUpdatedAt: timestamp("forge_updated_at", { withTimezone: true }),
    ownershipPolicy: varchar("ownership_policy", { length: 64 }),
    recommendedResolution: varchar("recommended_resolution", { length: 64 }),
    resolutionAction: varchar("resolution_action", { length: 64 }),
    resolutionReason: text("resolution_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalatedToUserId: uuid("escalated_to_user_id"),
    severity: varchar("severity", { length: 32 }).notNull().default("MEDIUM"),
    matchScore: integer("match_score"),
    candidateIncidentIdsJson: jsonb("candidate_incident_ids_json"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("cad_conflicts_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("cad_conflicts_type_idx").on(table.tenantId, table.conflictType, table.status),
  ],
);

export const cadFieldProvenance = pgTable(
  "cad_field_provenance",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    fieldIdentifier: varchar("field_identifier", { length: 200 }).notNull(),
    currentValueSource: varchar("current_value_source", { length: 32 }).notNull(),
    sourceSystem: varchar("source_system", { length: 64 }).notNull().default("CAD"),
    cadConnectionId: uuid("cad_connection_id").references(() => cadConnections.id),
    cadRawMessageId: uuid("cad_raw_message_id").references(() => cadRawMessages.id),
    cadNormalizedEventId: uuid("cad_normalized_event_id").references(() => cadNormalizedEvents.id),
    sourcePath: varchar("source_path", { length: 500 }),
    sourceValueHash: varchar("source_value_hash", { length: 64 }),
    mappingProfileId: uuid("mapping_profile_id").references(() => cadMappingProfiles.id),
    mappingVersion: integer("mapping_version"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    appliedByUserId: uuid("applied_by_user_id"),
    manualOverrideAt: timestamp("manual_override_at", { withTimezone: true }),
    manualOverrideByUserId: uuid("manual_override_by_user_id"),
    manualOverrideReason: text("manual_override_reason"),
    ownershipPolicy: varchar("ownership_policy", { length: 64 })
      .notNull()
      .default("CAD_UNTIL_MANUAL_EDIT"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_field_provenance_uidx").on(
      table.tenantId,
      table.incidentId,
      table.fieldIdentifier,
    ),
    index("cad_field_provenance_incident_idx").on(table.tenantId, table.incidentId),
  ],
);

export const cadManualFallbackSessions = pgTable(
  "cad_manual_fallback_sessions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id").references(() => cadConnections.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    reason: text("reason").notNull(),
    declaredByUserId: uuid("declared_by_user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedByUserId: uuid("ended_by_user_id"),
    affectedIncidentCount: integer("affected_incident_count").notNull().default(0),
    unresolvedDuplicateCount: integer("unresolved_duplicate_count").notNull().default(0),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("cad_manual_fallback_tenant_idx").on(table.tenantId, table.status)],
);

export const cadUnitMappings = pgTable(
  "cad_unit_mappings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    sourceUnitId: varchar("source_unit_id", { length: 120 }).notNull(),
    sourceUnitCallsign: varchar("source_unit_callsign", { length: 120 }),
    forgeApparatusId: uuid("forge_apparatus_id"),
    forgeUnitId: uuid("forge_unit_id"),
    mappingType: varchar("mapping_type", { length: 40 }).notNull().default("APPARATUS"),
    externalAgency: boolean("external_agency").notNull().default(false),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    notes: text("notes"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_unit_mappings_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.sourceUnitId,
    ),
  ],
);

export const cadUnknownUnits = pgTable(
  "cad_unknown_units",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    sourceUnitId: varchar("source_unit_id", { length: 120 }).notNull(),
    sourceUnitCallsign: varchar("source_unit_callsign", { length: 120 }),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastRawMessageId: uuid("last_raw_message_id").references(() => cadRawMessages.id),
    status: varchar("status", { length: 32 }).notNull().default("OPEN"),
    assignedReviewerUserId: uuid("assigned_reviewer_user_id"),
    resolvedMappingId: uuid("resolved_mapping_id").references(() => cadUnitMappings.id),
    resolutionReason: text("resolution_reason"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_unknown_units_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.sourceUnitId,
    ),
    index("cad_unknown_units_status_idx").on(table.tenantId, table.status, table.lastSeenAt),
  ],
);

export const cadPersonnelMappings = pgTable(
  "cad_personnel_mappings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    sourcePersonnelId: varchar("source_personnel_id", { length: 120 }).notNull(),
    sourceName: varchar("source_name", { length: 300 }),
    forgePersonId: uuid("forge_person_id"),
    forgePersonnelId: uuid("forge_personnel_id"),
    mappingType: varchar("mapping_type", { length: 40 }).notNull().default("PERSONNEL"),
    externalAgency: boolean("external_agency").notNull().default(false),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    notes: text("notes"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_personnel_mappings_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.sourcePersonnelId,
    ),
  ],
);

export const cadUnknownPersonnel = pgTable(
  "cad_unknown_personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    sourcePersonnelId: varchar("source_personnel_id", { length: 120 }).notNull(),
    sourceName: varchar("source_name", { length: 300 }),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastRawMessageId: uuid("last_raw_message_id").references(() => cadRawMessages.id),
    status: varchar("status", { length: 32 }).notNull().default("OPEN"),
    assignedReviewerUserId: uuid("assigned_reviewer_user_id"),
    resolvedMappingId: uuid("resolved_mapping_id").references(() => cadPersonnelMappings.id),
    resolutionReason: text("resolution_reason"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("cad_unknown_personnel_uidx").on(
      table.tenantId,
      table.cadConnectionId,
      table.sourcePersonnelId,
    ),
    index("cad_unknown_personnel_status_idx").on(table.tenantId, table.status, table.lastSeenAt),
  ],
);

export const cadConnectionOutages = pgTable(
  "cad_connection_outages",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    reason: text("reason").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    startedByUserId: uuid("started_by_user_id"),
    endedByUserId: uuid("ended_by_user_id"),
    source: varchar("source", { length: 40 }).notNull().default("MANUAL"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("cad_connection_outages_tenant_idx").on(table.tenantId, table.status, table.startedAt),
    index("cad_connection_outages_connection_idx").on(table.cadConnectionId, table.status),
  ],
);

export const cadConnectionHealthLogs = pgTable(
  "cad_connection_health_logs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cadConnectionId: uuid("cad_connection_id")
      .notNull()
      .references(() => cadConnections.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    healthStatus: varchar("health_status", { length: 32 }).notNull(),
    latencyMs: integer("latency_ms"),
    detail: text("detail"),
    source: varchar("source", { length: 40 }).notNull().default("SYSTEM"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("cad_connection_health_logs_tenant_idx").on(
      table.tenantId,
      table.cadConnectionId,
      table.checkedAt,
    ),
  ],
);

export const cadRetentionRuns = pgTable(
  "cad_retention_runs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull().default("RUNNING"),
    scope: varchar("scope", { length: 64 }).notNull().default("RAW_AND_REPLAY"),
    replayCachePurged: integer("replay_cache_purged").notNull().default(0),
    rawPayloadsPurged: integer("raw_payloads_purged").notNull().default(0),
    callerFieldsRedacted: integer("caller_fields_redacted").notNull().default(0),
    errorSummary: text("error_summary"),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("cad_retention_runs_started_idx").on(table.startedAt)],
);
