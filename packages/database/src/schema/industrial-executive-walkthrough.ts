/**
 * Executive walkthrough presentation settings, narration cache, and render tokens.
 * Migration 0088.
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
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { platformJobs } from "./platform-jobs.js";

export const industrialExecutiveWalkthroughSettings = pgTable(
  "industrial_executive_walkthrough_settings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    enabled: boolean("enabled").notNull().default(true),
    voiceId: varchar("voice_id", { length: 120 }).notNull().default("Danielle"),
    narrationSpeed: integer("narration_speed").notNull().default(100),
    captionsDefault: boolean("captions_default").notNull().default(true),
    includeIntro: boolean("include_intro").notNull().default(true),
    includeOutro: boolean("include_outro").notNull().default(true),
    exportResolution: varchar("export_resolution", { length: 16 }).notNull().default("1080p"),
    retentionDays: integer("retention_days"),
    closingText: text("closing_text"),
    sceneOverrides: jsonb("scene_overrides").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [uniqueIndex("industrial_exec_walkthrough_settings_tenant_uidx").on(t.tenantId)],
);

export const industrialExecutiveWalkthroughNarration = pgTable(
  "industrial_executive_walkthrough_narration",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sceneId: varchar("scene_id", { length: 80 }).notNull(),
    contentVersion: varchar("content_version", { length: 64 }).notNull(),
    voiceId: varchar("voice_id", { length: 120 }).notNull(),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    storageBucket: varchar("storage_bucket", { length: 200 }),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull().default("audio/mpeg"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_exec_walkthrough_narration_uidx").on(
      t.tenantId,
      t.sceneId,
      t.contentVersion,
      t.voiceId,
    ),
    index("industrial_exec_walkthrough_narration_tenant_idx").on(t.tenantId),
  ],
);

export const industrialExecutiveWalkthroughRenderTokens = pgTable(
  "industrial_executive_walkthrough_render_tokens",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    exportJobId: uuid("export_job_id")
      .notNull()
      .references(() => platformJobs.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_exec_walkthrough_render_token_uidx").on(t.tokenHash),
    index("industrial_exec_walkthrough_render_token_job_idx").on(t.exportJobId),
    index("industrial_exec_walkthrough_render_token_expires_idx").on(t.expiresAt),
  ],
);

export type IndustrialExecutiveWalkthroughSettingsRow =
  typeof industrialExecutiveWalkthroughSettings.$inferSelect;
export type IndustrialExecutiveWalkthroughNarrationRow =
  typeof industrialExecutiveWalkthroughNarration.$inferSelect;
export type IndustrialExecutiveWalkthroughRenderTokenRow =
  typeof industrialExecutiveWalkthroughRenderTokens.$inferSelect;
