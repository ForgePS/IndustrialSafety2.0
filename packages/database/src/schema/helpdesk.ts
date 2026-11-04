import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { forgeDocuments } from "./documents.js";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";

/** Platform-wide yearly counter backing SUP-YYYY-###### ticket numbers (not tenant scoped). */
export const supportTicketSequences = pgTable("support_ticket_sequences", {
  year: integer("year").primaryKey(),
  lastValue: bigint("last_value", { mode: "number" }).notNull().default(0),
  updatedAt: updatedAtColumn,
});

/** Request types and product areas; tenant_id NULL rows are Forge-global defaults. */
export const supportCategories = pgTable(
  "support_categories",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    productCode: varchar("product_code", { length: 64 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("support_categories_kind_idx").on(table.kind, table.productCode)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productCode: varchar("product_code", { length: 64 }).notNull().default("FORGE_INDUSTRIAL"),
    moduleCode: varchar("module_code", { length: 80 }),
    ticketNumber: varchar("ticket_number", { length: 32 }).notNull(),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterName: varchar("requester_name", { length: 200 }).notNull(),
    requesterEmail: varchar("requester_email", { length: 320 }),
    requestType: varchar("request_type", { length: 64 }).notNull(),
    productArea: varchar("product_area", { length: 80 }),
    categoryId: uuid("category_id"),
    subject: varchar("subject", { length: 300 }).notNull(),
    description: text("description").notNull(),
    customerReportedSeverity: varchar("customer_reported_severity", { length: 16 }),
    priority: varchar("priority", { length: 16 }).notNull().default("P3_NORMAL"),
    status: varchar("status", { length: 32 }).notNull().default("NEW"),
    disposition: varchar("disposition", { length: 40 }),
    assignedTeam: varchar("assigned_team", { length: 80 }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    assignedUserName: varchar("assigned_user_name", { length: 200 }),
    source: varchar("source", { length: 32 }).notNull().default("WEB"),
    locationId: uuid("location_id"),
    divisionId: uuid("division_id"),
    relatedEntityType: varchar("related_entity_type", { length: 80 }),
    relatedEntityId: uuid("related_entity_id"),
    technicalContext: jsonb("technical_context").notNull().default({}),
    askForgeContext: jsonb("ask_forge_context"),
    clientRequestId: varchar("client_request_id", { length: 120 }),
    mergedIntoTicketId: uuid("merged_into_ticket_id"),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    lastCustomerActivityAt: timestamp("last_customer_activity_at", { withTimezone: true }),
    lastSupportActivityAt: timestamp("last_support_activity_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
  },
  (table) => [
    uniqueIndex("support_tickets_number_uidx").on(table.ticketNumber),
    index("support_tickets_tenant_status_idx").on(table.tenantId, table.status),
    index("support_tickets_requester_idx").on(
      table.tenantId,
      table.requesterUserId,
      table.createdAt,
    ),
    index("support_tickets_status_priority_idx").on(table.status, table.priority),
    index("support_tickets_assignee_idx").on(table.assignedUserId, table.status),
  ],
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    authorUserId: uuid("author_user_id").references(() => users.id),
    authorName: varchar("author_name", { length: 200 }).notNull(),
    authorType: varchar("author_type", { length: 16 }).notNull(),
    messageType: varchar("message_type", { length: 32 }).notNull(),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("support_ticket_messages_ticket_idx").on(table.ticketId, table.createdAt)],
);

export const supportTicketAttachments = pgTable(
  "support_ticket_attachments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    messageId: uuid("message_id").references(() => supportTicketMessages.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => forgeDocuments.id),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    uploadedByName: varchar("uploaded_by_name", { length: 200 }),
    uploadedByType: varchar("uploaded_by_type", { length: 16 }).notNull().default("CUSTOMER"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [index("support_ticket_attachments_ticket_idx").on(table.ticketId)],
);

/** Ticket timeline events: status, priority, assignment, tags, watchers, attachments. */
export const supportTicketEvents = pgTable(
  "support_ticket_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    fromValue: varchar("from_value", { length: 200 }),
    toValue: varchar("to_value", { length: 200 }),
    isInternal: boolean("is_internal").notNull().default(false),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorName: varchar("actor_name", { length: 200 }),
    actorType: varchar("actor_type", { length: 16 }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (table) => [index("support_ticket_events_ticket_idx").on(table.ticketId, table.createdAt)],
);

export const supportTags = pgTable(
  "support_tags",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    slug: varchar("slug", { length: 80 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 16 }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("support_tags_slug_idx").on(table.slug)],
);

export const supportTicketTags = pgTable(
  "support_ticket_tags",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => supportTags.id),
    addedByUserId: uuid("added_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    primaryKey({ columns: [table.ticketId, table.tagId] }),
    index("support_ticket_tags_tag_idx").on(table.tagId),
  ],
);

export const supportTicketWatchers = pgTable(
  "support_ticket_watchers",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    userName: varchar("user_name", { length: 200 }).notNull(),
    addedByUserId: uuid("added_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    primaryKey({ columns: [table.ticketId, table.userId] }),
    index("support_ticket_watchers_user_idx").on(table.userId),
  ],
);
