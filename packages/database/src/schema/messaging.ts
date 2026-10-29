import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { forgeDocuments } from "./neris-specialty.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Tenant-scoped conversation thread (direct, group, or channel). */
export const industrialMessagingThreads = pgTable(
  "industrial_messaging_threads",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    threadType: varchar("thread_type", { length: 32 }).notNull().default("DIRECT"),
    title: varchar("title", { length: 300 }),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: varchar("last_message_preview", { length: 500 }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("industrial_messaging_threads_tenant_last_msg_idx").on(
      table.tenantId,
      table.lastMessageAt,
    ),
    index("industrial_messaging_threads_tenant_type_idx").on(table.tenantId, table.threadType),
  ],
);

/** Thread membership and read state. */
export const industrialMessagingThreadMembers = pgTable(
  "industrial_messaging_thread_members",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => industrialMessagingThreads.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: varchar("role", { length: 32 }).notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_messaging_thread_members_thread_idx").on(table.threadId),
    index("industrial_messaging_thread_members_user_idx").on(table.tenantId, table.userId),
  ],
);

/** Message body within a thread. */
export const industrialMessagingMessages = pgTable(
  "industrial_messaging_messages",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => industrialMessagingThreads.id),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull().default(""),
    messageType: varchar("message_type", { length: 32 }).notNull().default("TEXT"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("industrial_messaging_messages_thread_created_idx").on(table.threadId, table.createdAt),
    index("industrial_messaging_messages_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

/** File, image, document, or link attachment on a message. */
export const industrialMessagingAttachments = pgTable(
  "industrial_messaging_attachments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: uuid("message_id").references(() => industrialMessagingMessages.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => industrialMessagingThreads.id),
    attachmentType: varchar("attachment_type", { length: 32 }).notNull(),
    documentId: uuid("document_id").references(() => forgeDocuments.id),
    linkUrl: varchar("link_url", { length: 2000 }),
    linkTitle: varchar("link_title", { length: 500 }),
    linkDescription: text("link_description"),
    originalFilename: varchar("original_filename", { length: 500 }),
    mimeType: varchar("mime_type", { length: 255 }),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    uploadStatus: varchar("upload_status", { length: 32 }).notNull().default("COMPLETE"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_messaging_attachments_message_idx").on(table.messageId),
    index("industrial_messaging_attachments_thread_idx").on(table.threadId),
  ],
);

export type IndustrialMessagingThread = typeof industrialMessagingThreads.$inferSelect;
export type IndustrialMessagingMessage = typeof industrialMessagingMessages.$inferSelect;
export type IndustrialMessagingAttachment = typeof industrialMessagingAttachments.$inferSelect;
