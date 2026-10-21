/**
 * Industrial Document Control QMS tables (migration 0087).
 * Document shell lives on platform_documents in industrial.ts.
 */
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
  bigint,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { platformDocuments } from "./industrial.js";

export const platformDocumentVersions = pgTable(
  "platform_document_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => platformDocuments.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull().default(1),
    filename: varchar("filename", { length: 255 }),
    contentType: varchar("content_type", { length: 200 }),
    contentLength: bigint("content_length", { mode: "number" }).notNull().default(0),
    storageBucket: varchar("storage_bucket", { length: 200 }),
    storageKey: text("storage_key").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    workflowStatus: varchar("workflow_status", { length: 64 }).notNull().default("DRAFT"),
    changeSummary: text("change_summary"),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    sourceSystem: varchar("source_system", { length: 64 }).notNull().default("FIREBASE"),
    sourceProject: varchar("source_project", { length: 128 }),
    sourceCollection: varchar("source_collection", { length: 128 }),
    sourceDocumentId: varchar("source_document_id", { length: 256 }),
    sourcePath: varchar("source_path", { length: 512 }),
    sourcePayload: jsonb("source_payload").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("platform_document_versions_doc_idx").on(t.tenantId, t.documentId),
    index("platform_document_versions_workflow_idx").on(t.tenantId, t.documentId, t.workflowStatus),
  ],
);

export const platformDocumentDistributions = pgTable(
  "platform_document_distributions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => platformDocuments.id, { onDelete: "cascade" }),
    scopeType: varchar("scope_type", { length: 32 }).notNull(),
    scopeId: uuid("scope_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("platform_document_distributions_doc_idx").on(t.tenantId, t.documentId)],
);

export const platformDocumentAckRequirements = pgTable(
  "platform_document_ack_requirements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => platformDocuments.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => platformDocumentVersions.id, { onDelete: "cascade" }),
    distributionId: uuid("distribution_id").references(() => platformDocumentDistributions.id, {
      onDelete: "set null",
    }),
    required: boolean("required").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("platform_document_ack_requirements_version_idx").on(t.tenantId, t.versionId),
    index("platform_document_ack_requirements_doc_idx").on(t.tenantId, t.documentId),
  ],
);

export const platformDocumentAcknowledgments = pgTable(
  "platform_document_acknowledgments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => platformDocuments.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => platformDocumentVersions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    source: varchar("source", { length: 64 }).notNull().default("DOCUMENT_CONTROL"),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("platform_document_acknowledgments_user_version_uidx").on(
      t.tenantId,
      t.userId,
      t.versionId,
    ),
    index("platform_document_acknowledgments_doc_idx").on(t.tenantId, t.documentId),
  ],
);
