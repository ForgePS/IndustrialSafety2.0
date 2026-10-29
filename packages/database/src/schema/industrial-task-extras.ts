/**
 * Task subtasks, checklist items, and activity (Wave 3 System Tools).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { industrialTasks } from "./industrial-module-tables.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const industrialTaskSubtasks = pgTable(
  "industrial_task_subtasks",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => industrialTasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    isDone: boolean("is_done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_task_subtasks_task_idx").on(t.tenantId, t.taskId, t.sortOrder)],
);

export const industrialTaskChecklistItems = pgTable(
  "industrial_task_checklist_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => industrialTasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    isDone: boolean("is_done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_task_checklist_items_task_idx").on(t.tenantId, t.taskId, t.sortOrder)],
);

export const industrialTaskActivity = pgTable(
  "industrial_task_activity",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => industrialTasks.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(),
    detailJson: jsonb("detail_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [index("industrial_task_activity_task_idx").on(t.tenantId, t.taskId, t.createdAt)],
);
