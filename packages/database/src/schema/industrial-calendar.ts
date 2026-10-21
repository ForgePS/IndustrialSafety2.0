/**
 * Calendar events + reminders (System Tools).
 * Wave 2: categories + simple recurrence on events.
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { industrialSites } from "./industrial.js";
import { industrialTasks } from "./industrial-module-tables.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const industrialCalendarCategories = pgTable(
  "industrial_calendar_categories",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#696cff"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_calendar_categories_tenant_name_uidx")
      .on(t.tenantId, t.name)
      .where(sql`${t.archivedAt} is null`),
    index("industrial_calendar_categories_tenant_idx").on(t.tenantId, t.sortOrder),
  ],
);

export const industrialCalendarEvents = pgTable(
  "industrial_calendar_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    status: varchar("status", { length: 64 }).notNull().default("SCHEDULED"),
    categoryId: uuid("category_id").references(() => industrialCalendarCategories.id, {
      onDelete: "set null",
    }),
    recurrenceRule: varchar("recurrence_rule", { length: 120 }),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
    recurrenceCount: integer("recurrence_count"),
    seriesId: uuid("series_id"),
    taskId: uuid("task_id").references(() => industrialTasks.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_calendar_events_tenant_range_idx").on(t.tenantId, t.startsAt, t.endsAt),
    index("industrial_calendar_events_tenant_task_idx").on(t.tenantId, t.taskId),
    index("industrial_calendar_events_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_calendar_events_tenant_category_idx").on(t.tenantId, t.categoryId),
    index("industrial_calendar_events_tenant_series_idx").on(t.tenantId, t.seriesId),
  ],
);

export const industrialReminders = pgTable(
  "industrial_reminders",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventId: uuid("event_id").references(() => industrialCalendarEvents.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => industrialTasks.id, { onDelete: "set null" }),
    title: varchar("title", { length: 500 }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    channel: varchar("channel", { length: 32 }).notNull().default("IN_APP"),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    recipientUserIds: jsonb("recipient_user_ids").$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_reminders_due_idx").on(t.tenantId, t.status, t.remindAt),
    index("industrial_reminders_event_idx").on(t.tenantId, t.eventId),
    index("industrial_reminders_task_idx").on(t.tenantId, t.taskId),
  ],
);
