/**
 * Shared document storage records (S3 objects) used by branding, company documents,
 * helpdesk, messaging, and photo markup. Table created in migration 0011.
 */
import {
  index,
  integer,
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

export const forgeDocuments = pgTable(
  "forge_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    storedFilename: varchar("stored_filename", { length: 500 }).notNull(),
    objectKey: varchar("object_key", { length: 1000 }).notNull(),
    bucketName: varchar("bucket_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    securityClassification: varchar("security_classification", { length: 40 })
      .notNull()
      .default("INTERNAL"),
    malwareScanStatus: varchar("malware_scan_status", { length: 40 }).notNull().default("PENDING"),
    malwareScanDetail: text("malware_scan_detail"),
    retentionRule: varchar("retention_rule", { length: 80 }).notNull().default("INCIDENT_DEFAULT"),
    uploadStatus: varchar("upload_status", { length: 40 }).notNull().default("INITIALIZED"),
    source: varchar("source", { length: 40 }).notNull().default("RMS_WEB"),
    captureAt: timestamp("capture_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("forge_documents_tenant_idx").on(table.tenantId),
    uniqueIndex("forge_documents_tenant_object_uidx").on(table.tenantId, table.objectKey),
  ],
);
