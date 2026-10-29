import {
  boolean,
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
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const aiProviderConfigurations = pgTable(
  "ai_provider_configurations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    providerKey: varchar("provider_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DISABLED"),
    secretArn: text("secret_arn"),
    region: varchar("region", { length: 32 }),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("ai_provider_configurations_tenant_idx").on(table.tenantId, table.product)],
);

export const aiModelPolicies = pgTable(
  "ai_model_policies",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    providerKey: varchar("provider_key", { length: 64 }).notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    maxInputTokens: integer("max_input_tokens").notNull().default(8000),
    maxOutputTokens: integer("max_output_tokens").notNull().default(2000),
    allowConfidential: boolean("allow_confidential").notNull().default(false),
    allowRestricted: boolean("allow_restricted").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("ai_model_policies_tenant_idx").on(table.tenantId, table.product, table.status),
  ],
);

export const aiNarrativePolicies = pgTable(
  "ai_narrative_policies",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    requireAcceptedTerms: boolean("require_accepted_terms").notNull().default(true),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsAcceptedByUserId: uuid("terms_accepted_by_user_id").references(() => users.id),
    monthlyRequestQuota: integer("monthly_request_quota").notNull().default(100),
    dailyUserQuota: integer("daily_user_quota").notNull().default(20),
    perRecordLimit: integer("per_record_limit").notNull().default(10),
    costCeilingUsd: numeric("cost_ceiling_usd", { precision: 12, scale: 4 }),
    status: varchar("status", { length: 32 }).notNull().default("DISABLED"),
    policyJson: jsonb("policy_json").notNull().default({}),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("ai_narrative_policies_tenant_product_uidx").on(table.tenantId, table.product),
  ],
);

export const aiNarrativeTemplates = pgTable(
  "ai_narrative_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    module: varchar("module", { length: 64 }).notNull(),
    recordType: varchar("record_type", { length: 120 }).notNull(),
    key: varchar("key", { length: 120 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    isSystem: boolean("is_system").notNull().default(false),
    currentVersion: integer("current_version").notNull().default(1),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("ai_narrative_templates_key_uidx").on(table.tenantId, table.product, table.key),
  ],
);

export const aiNarrativeTemplateVersions = pgTable(
  "ai_narrative_template_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => aiNarrativeTemplates.id),
    version: integer("version").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    systemPrompt: text("system_prompt").notNull(),
    userPromptTemplate: text("user_prompt_template").notNull(),
    safetyRulesJson: jsonb("safety_rules_json").notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("ai_narrative_template_versions_uidx").on(table.templateId, table.version),
  ],
);

export const aiNarrativeRequests = pgTable(
  "ai_narrative_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    module: varchar("module", { length: 64 }).notNull(),
    recordType: varchar("record_type", { length: 120 }).notNull(),
    recordId: uuid("record_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    requestType: varchar("request_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    provider: varchar("provider", { length: 64 }),
    modelPolicyId: uuid("model_policy_id").references(() => aiModelPolicies.id),
    templateVersionId: uuid("template_version_id").references(() => aiNarrativeTemplateVersions.id),
    sourceHash: varchar("source_hash", { length: 128 }),
    correlationId: varchar("correlation_id", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    failureCode: varchar("failure_code", { length: 64 }),
    failureSummary: text("failure_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("ai_narrative_requests_tenant_record_idx").on(
      table.tenantId,
      table.recordType,
      table.recordId,
    ),
    index("ai_narrative_requests_status_idx").on(table.tenantId, table.status, table.createdAt),
    uniqueIndex("ai_narrative_requests_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
  ],
);

export const aiNarrativeSources = pgTable(
  "ai_narrative_sources",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => aiNarrativeRequests.id),
    manifestJson: jsonb("manifest_json").notNull(),
    redactionSummaryJson: jsonb("redaction_summary_json"),
    createdAt: createdAtColumn,
  },
  (table) => [index("ai_narrative_sources_request_idx").on(table.requestId)],
);

export const aiNarrativeDrafts = pgTable(
  "ai_narrative_drafts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => aiNarrativeRequests.id),
    draftText: text("draft_text").notNull(),
    structuredResponseJson: jsonb("structured_response_json").notNull(),
    confidenceSummary: text("confidence_summary"),
    warningsJson: jsonb("warnings_json").notNull().default([]),
    missingInformationJson: jsonb("missing_information_json").notNull().default([]),
    unsupportedClaimsJson: jsonb("unsupported_claims_json").notNull().default([]),
    sourceMappingJson: jsonb("source_mapping_json").notNull().default([]),
    label: varchar("label", { length: 64 }).notNull().default("AI DRAFT — NOT REVIEWED"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
  },
  (table) => [index("ai_narrative_drafts_request_idx").on(table.requestId, table.version)],
);

export const aiNarrativeRevisions = pgTable(
  "ai_narrative_revisions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => aiNarrativeRequests.id),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => aiNarrativeDrafts.id),
    action: varchar("action", { length: 64 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    snapshotJson: jsonb("snapshot_json").notNull(),
    createdAt: createdAtColumn,
  },
  (table) => [index("ai_narrative_revisions_request_idx").on(table.requestId, table.createdAt)],
);

export const aiNarrativeFeedback = pgTable(
  "ai_narrative_feedback",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => aiNarrativeRequests.id),
    draftId: uuid("draft_id").references(() => aiNarrativeDrafts.id),
    rating: integer("rating"),
    body: text("body"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [index("ai_narrative_feedback_request_idx").on(table.requestId)],
);

export const aiNarrativeUsage = pgTable(
  "ai_narrative_usage",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    product: varchar("product", { length: 32 }).notNull(),
    userId: uuid("user_id").references(() => users.id),
    requestId: uuid("request_id").references(() => aiNarrativeRequests.id),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
    latencyMs: integer("latency_ms"),
    outcome: varchar("outcome", { length: 32 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAtColumn,
  },
  (table) => [index("ai_narrative_usage_tenant_time_idx").on(table.tenantId, table.occurredAt)],
);

export const aiNarrativeAuditEvents = pgTable(
  "ai_narrative_audit_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id").references(() => users.id),
    product: varchar("product", { length: 32 }).notNull(),
    module: varchar("module", { length: 64 }),
    recordType: varchar("record_type", { length: 120 }),
    recordId: uuid("record_id"),
    requestId: uuid("request_id").references(() => aiNarrativeRequests.id),
    provider: varchar("provider", { length: 64 }),
    modelPolicyId: uuid("model_policy_id"),
    templateVersionId: uuid("template_version_id"),
    sourceHash: varchar("source_hash", { length: 128 }),
    action: varchar("action", { length: 80 }).notNull(),
    correlationId: varchar("correlation_id", { length: 128 }).notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("ai_narrative_audit_events_tenant_time_idx").on(table.tenantId, table.occurredAt),
    index("ai_narrative_audit_events_request_idx").on(table.requestId),
  ],
);
