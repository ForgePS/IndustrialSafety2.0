import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAtColumn } from "./common.js";
import { organizations } from "./organizations.js";
import { persons } from "./persons.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Append-only audit trail. Migration SQL revokes UPDATE/DELETE from app roles. */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorPersonId: uuid("actor_person_id").references(() => persons.id),
  actorType: varchar("actor_type", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  resourceType: varchar("resource_type", { length: 128 }).notNull(),
  resourceId: uuid("resource_id"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  result: varchar("result", { length: 32 }).notNull(),
  riskLevel: varchar("risk_level", { length: 32 }).notNull().default("NORMAL"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  requestId: varchar("request_id", { length: 128 }).notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: createdAtColumn,
});
