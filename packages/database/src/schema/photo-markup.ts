import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { forgeDocuments } from "./neris-specialty.js";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";

/**
 * Non-destructive photo registry. Original binary lives in forge_documents;
 * markup revisions store editable JSON + optional rendered derivative documents.
 */
export const forgePhotos = pgTable(
  "forge_photos",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    originalDocumentId: uuid("original_document_id")
      .notNull()
      .references(() => forgeDocuments.id),
    originalFileName: varchar("original_file_name", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    fileSizeBytes: integer("file_size_bytes"),
    source: varchar("source", { length: 40 }).notNull().default("upload"),
    module: varchar("module", { length: 80 }),
    recordId: uuid("record_id"),
    locationId: uuid("location_id"),
    divisionId: uuid("division_id"),
    capturedByUserId: uuid("captured_by_user_id").references(() => users.id),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    caption: text("caption"),
    description: text("description"),
    hasMarkup: boolean("has_markup").notNull().default(false),
    currentRevisionId: uuid("current_revision_id"),
    metadata: jsonb("metadata").notNull().default({}),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("forge_photos_tenant_idx").on(table.tenantId),
    index("forge_photos_tenant_module_record_idx").on(table.tenantId, table.module, table.recordId),
    index("forge_photos_original_document_idx").on(table.originalDocumentId),
  ],
);

export const photoMarkupRevisions = pgTable(
  "photo_markup_revisions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => forgePhotos.id),
    version: integer("version").notNull(),
    status: varchar("status", { length: 40 }).notNull().default("final"),
    annotationJson: jsonb("annotation_json").notNull().default({}),
    annotationDocumentId: uuid("annotation_document_id").references(() => forgeDocuments.id),
    renderedDocumentId: uuid("rendered_document_id").references(() => forgeDocuments.id),
    thumbnailDocumentId: uuid("thumbnail_document_id").references(() => forgeDocuments.id),
    canvasWidth: integer("canvas_width").notNull().default(0),
    canvasHeight: integer("canvas_height").notNull().default(0),
    sourceRevisionId: uuid("source_revision_id"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("photo_markup_revisions_photo_idx").on(table.photoId),
    uniqueIndex("photo_markup_revisions_photo_version_uidx").on(table.photoId, table.version),
    index("photo_markup_revisions_tenant_idx").on(table.tenantId),
  ],
);
