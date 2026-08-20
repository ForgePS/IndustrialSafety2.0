import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Platform-shared legal documents (Forge-global when tenant_id IS NULL).
 * Not industrial controlled-docs (`platform_documents`).
 */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    documentKey: varchar("document_key", { length: 128 }).notNull(),
    productScope: varchar("product_scope", { length: 64 }).notNull().default("FORGE_INDUSTRIAL"),
    documentType: varchar("document_type", { length: 64 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    currentVersionId: uuid("current_version_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("legal_documents_product_status_idx").on(table.productScope, table.status),
    index("legal_documents_tenant_idx").on(table.tenantId),
  ],
);

export const legalDocumentVersions = pgTable(
  "legal_document_versions",
  {
    id: uuid("id").primaryKey(),
    legalDocumentId: uuid("legal_document_id")
      .notNull()
      .references(() => legalDocuments.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    version: varchar("version", { length: 64 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id),
    contentFormat: varchar("content_format", { length: 32 }).notNull().default("HTML"),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    changeSummary: text("change_summary"),
    materialChange: boolean("material_change").notNull().default(true),
    requiresReacknowledgment: boolean("requires_reacknowledgment").notNull().default(true),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("legal_document_versions_doc_version_uidx").on(
      table.legalDocumentId,
      table.versionNumber,
    ),
    index("legal_document_versions_status_effective_idx").on(
      table.status,
      table.effectiveAt,
    ),
    index("legal_document_versions_tenant_idx").on(table.tenantId),
  ],
);

export const legalAcknowledgmentRequirements = pgTable(
  "legal_acknowledgment_requirements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    product: varchar("product", { length: 64 }).notNull().default("FORGE_INDUSTRIAL"),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocuments.id),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => legalDocumentVersions.id),
    required: boolean("required").notNull().default(true),
    requiredFrom: timestamp("required_from", { withTimezone: true }).notNull(),
    requiredUntil: timestamp("required_until", { withTimezone: true }),
    requiredBy: timestamp("required_by", { withTimezone: true }),
    roleScope: varchar("role_scope", { length: 128 }),
    locationScope: uuid("location_scope"),
    departmentScope: uuid("department_scope"),
    userScope: uuid("user_scope").references(() => users.id),
    reacknowledgmentPolicy: varchar("reacknowledgment_policy", { length: 64 })
      .notNull()
      .default("ON_MATERIAL_VERSION"),
    blockingMode: varchar("blocking_mode", { length: 32 }).notNull().default("BLOCKING"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("legal_ack_requirements_product_idx").on(table.product, table.requiredFrom),
    index("legal_ack_requirements_tenant_idx").on(table.tenantId),
    index("legal_ack_requirements_version_idx").on(table.documentVersionId),
  ],
);

/** Append-only acceptance evidence. UPDATE/DELETE revoked from forge_app. */
export const userLegalAcknowledgments = pgTable(
  "user_legal_acknowledgments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    product: varchar("product", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocuments.id),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => legalDocumentVersions.id),
    documentKey: varchar("document_key", { length: 128 }).notNull(),
    documentVersion: varchar("document_version", { length: 64 }).notNull(),
    documentHash: varchar("document_hash", { length: 64 }).notNull(),
    acknowledgmentType: varchar("acknowledgment_type", { length: 64 })
      .notNull()
      .default("PLATFORM_USER"),
    acknowledgmentTextVersion: varchar("acknowledgment_text_version", { length: 64 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    acceptedAction: varchar("accepted_action", { length: 64 }).notNull(),
    authSessionId: varchar("auth_session_id", { length: 128 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    deviceMetadata: jsonb("device_metadata").notNull().default({}),
    source: varchar("source", { length: 64 }).notNull().default("LOGIN_GATE"),
    personnelId: uuid("personnel_id"),
    locationId: uuid("location_id"),
    departmentId: uuid("department_id"),
    roleSnapshot: jsonb("role_snapshot"),
    emailSnapshot: varchar("email_snapshot", { length: 320 }),
    displayNameSnapshot: varchar("display_name_snapshot", { length: 320 }),
    status: varchar("status", { length: 32 }).notNull().default("ACKNOWLEDGED"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("user_legal_acknowledgments_active_uidx").on(
      table.tenantId,
      table.userId,
      table.documentVersionId,
    ),
    index("user_legal_acknowledgments_user_idx").on(table.tenantId, table.userId, table.acceptedAt),
    index("user_legal_acknowledgments_document_idx").on(table.documentId, table.documentVersionId),
  ],
);

/** Append-only correction/revocation events (never mutate acknowledgments). */
export const legalAcknowledgmentEvents = pgTable(
  "legal_acknowledgment_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    acknowledgmentId: uuid("acknowledgment_id")
      .notNull()
      .references(() => userLegalAcknowledgments.id),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("legal_acknowledgment_events_ack_idx").on(table.acknowledgmentId, table.occurredAt),
    index("legal_acknowledgment_events_tenant_idx").on(table.tenantId, table.occurredAt),
  ],
);

export const attestationTemplates = pgTable(
  "attestation_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    templateKey: varchar("template_key", { length: 128 }).notNull(),
    product: varchar("product", { length: 64 }).notNull().default("FORGE_INDUSTRIAL"),
    module: varchar("module", { length: 64 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    currentVersionId: uuid("current_version_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("attestation_templates_product_module_idx").on(table.product, table.module),
  ],
);

export const attestationTemplateVersions = pgTable(
  "attestation_template_versions",
  {
    id: uuid("id").primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => attestationTemplates.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    version: varchar("version", { length: 64 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    attestationText: text("attestation_text").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("attestation_template_versions_uidx").on(table.templateId, table.versionNumber),
  ],
);

/** Append-only transaction attestation evidence. */
export const transactionAttestations = pgTable(
  "transaction_attestations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    product: varchar("product", { length: 64 }).notNull(),
    module: varchar("module", { length: 64 }).notNull(),
    recordType: varchar("record_type", { length: 128 }).notNull(),
    recordId: uuid("record_id").notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    personnelId: uuid("personnel_id"),
    attestationTemplateId: uuid("attestation_template_id").references(() => attestationTemplates.id),
    attestationVersion: varchar("attestation_version", { length: 64 }).notNull(),
    attestationText: text("attestation_text").notNull(),
    attestationHash: varchar("attestation_hash", { length: 64 }).notNull(),
    recordSnapshotHash: varchar("record_snapshot_hash", { length: 64 }),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    authSessionId: varchar("auth_session_id", { length: 128 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("transaction_attestations_record_idx").on(
      table.tenantId,
      table.recordType,
      table.recordId,
    ),
    index("transaction_attestations_user_idx").on(table.tenantId, table.userId, table.signedAt),
  ],
);
