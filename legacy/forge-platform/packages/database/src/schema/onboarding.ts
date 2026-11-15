import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Resumable customer onboarding (ADR-027). The tenant is created in
 * PROVISIONING as step 1, so a session always has a tenant to be scoped by.
 */
export const customerOnboardingSessions = pgTable(
  "customer_onboarding_sessions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerType: varchar("customer_type", { length: 32 }).notNull(),
    templateCode: varchar("template_code", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("IN_PROGRESS"),
    currentStep: integer("current_step").notNull().default(1),
    sessionDataJson: jsonb("session_data_json").notNull().default({}),
    activationErrorsJson: jsonb("activation_errors_json").notNull().default([]),
    startedByUserId: uuid("started_by_user_id")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("customer_onboarding_sessions_tenant_uidx").on(table.tenantId)],
);

export const customerOnboardingSteps = pgTable(
  "customer_onboarding_steps",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => customerOnboardingSessions.id),
    stepNumber: integer("step_number").notNull(),
    stepKey: varchar("step_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    payloadJson: jsonb("payload_json").notNull().default({}),
    validationErrorsJson: jsonb("validation_errors_json").notNull().default([]),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("customer_onboarding_steps_session_number_uidx").on(
      table.sessionId,
      table.stepNumber,
    ),
  ],
);
