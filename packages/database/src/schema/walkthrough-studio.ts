/**
 * Walkthrough Studio entities: presentations, versions, scenes, narration,
 * audio cache, video exports, share links, sessions, analytics, demo seeds.
 * Migration 0104.
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

export const walkthroughs = pgTable(
  "walkthroughs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    productCode: varchar("product_code", { length: 64 }).notNull().default("FORGE_INDUSTRIAL"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    defaultVoiceProfileId: varchar("default_voice_profile_id", { length: 120 }),
    publishedVersion: varchar("published_version", { length: 32 }),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    interactiveStatus: varchar("interactive_status", { length: 32 }).notNull().default("ready"),
    mp4Status: varchar("mp4_status", { length: 32 }).notNull().default("none"),
    metadata: jsonb("metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthroughs_tenant_code_uidx").on(t.tenantId, t.code),
    index("walkthroughs_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const walkthroughVersions = pgTable(
  "walkthrough_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 32 }).notNull(),
    scriptVersion: varchar("script_version", { length: 64 }).notNull(),
    definitionJson: jsonb("definition_json").notNull().default({}),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }),
    narrationSpeed: integer("narration_speed").notNull().default(100),
    runtimeMs: integer("runtime_ms"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_versions_uidx").on(t.walkthroughId, t.version),
    index("walkthrough_versions_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughChapters = pgTable(
  "walkthrough_chapters",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => walkthroughVersions.id, {
      onDelete: "cascade",
    }),
    chapterKey: varchar("chapter_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    targetDurationMs: integer("target_duration_ms").notNull().default(20_000),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_chapters_uidx").on(t.walkthroughId, t.versionId, t.chapterKey),
    index("walkthrough_chapters_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughScenes = pgTable(
  "walkthrough_scenes",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => walkthroughChapters.id, { onDelete: "cascade" }),
    sceneKey: varchar("scene_key", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    moduleCode: varchar("module_code", { length: 80 }),
    route: varchar("route", { length: 400 }).notNull(),
    durationMs: integer("duration_ms").notNull().default(20_000),
    narrationText: text("narration_text").notNull().default(""),
    captionText: text("caption_text"),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }),
    voiceSpeed: integer("voice_speed").notNull().default(100),
    targetSelector: varchar("target_selector", { length: 120 }),
    secondarySelectors: jsonb("secondary_selectors").notNull().default([]),
    actionsJson: jsonb("actions_json").notNull().default([]),
    transitionType: varchar("transition_type", { length: 32 }).notNull().default("direct"),
    transitionDurationMs: integer("transition_duration_ms").notNull().default(350),
    pauseBeforeMs: integer("pause_before_ms").notNull().default(0),
    pauseAfterMs: integer("pause_after_ms").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_scenes_uidx").on(t.chapterId, t.sceneKey),
    index("walkthrough_scenes_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughActions = pgTable(
  "walkthrough_actions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => walkthroughScenes.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 64 }).notNull(),
    payloadJson: jsonb("payload_json").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAtColumn,
  },
  (t) => [index("walkthrough_actions_scene_idx").on(t.sceneId)],
);

export const walkthroughNarrations = pgTable(
  "walkthrough_narrations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    sceneKey: varchar("scene_key", { length: 80 }).notNull(),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull().default("polly"),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    narrationText: text("narration_text").notNull(),
    durationMs: integer("duration_ms"),
    speed: integer("speed").notNull().default(100),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_narrations_uidx").on(
      t.walkthroughId,
      t.sceneKey,
      t.voiceProfileId,
      t.textHash,
    ),
    index("walkthrough_narrations_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughVoiceProfiles = pgTable(
  "walkthrough_voice_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    profileKey: varchar("profile_key", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    gender: varchar("gender", { length: 16 }).notNull(),
    accent: varchar("accent", { length: 80 }),
    tone: varchar("tone", { length: 200 }),
    provider: varchar("provider", { length: 32 }).notNull().default("polly"),
    providerVoiceId: varchar("provider_voice_id", { length: 120 }).notNull(),
    styleInstructions: text("style_instructions"),
    isSystem: boolean("is_system").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_voice_profiles_key_uidx").on(t.tenantId, t.profileKey),
  ],
);

export const walkthroughAudioAssets = pgTable(
  "walkthrough_audio_assets",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    narrationId: uuid("narration_id").references(() => walkthroughNarrations.id, {
      onDelete: "set null",
    }),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    sceneKey: varchar("scene_key", { length: 80 }).notNull(),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }).notNull(),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    storageBucket: varchar("storage_bucket", { length: 200 }),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull().default("audio/mpeg"),
    audioHash: varchar("audio_hash", { length: 64 }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_audio_assets_uidx").on(
      t.walkthroughId,
      t.sceneKey,
      t.voiceProfileId,
      t.textHash,
    ),
    index("walkthrough_audio_assets_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughVideoExports = pgTable(
  "walkthrough_video_exports",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => walkthroughVersions.id, {
      onDelete: "set null",
    }),
    exportJobId: uuid("export_job_id").references(() => platformJobs.id, {
      onDelete: "set null",
    }),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }),
    resolution: varchar("resolution", { length: 16 }).notNull().default("1080p"),
    durationMs: integer("duration_ms"),
    captionMode: varchar("caption_mode", { length: 32 }).notNull().default("off"),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    fileSizeBytes: integer("file_size_bytes"),
    storageBucket: varchar("storage_bucket", { length: 200 }),
    storageKey: text("storage_key"),
    contentVersion: varchar("content_version", { length: 64 }),
    renderConfig: jsonb("render_config").notNull().default({}),
    errorMessage: text("error_message"),
    overrideRuntime: boolean("override_runtime").notNull().default(false),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("walkthrough_video_exports_tenant_idx").on(t.tenantId),
    index("walkthrough_video_exports_status_idx").on(t.tenantId, t.status),
  ],
);

export const walkthroughShareLinks = pgTable(
  "walkthrough_share_links",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    publicToken: varchar("public_token", { length: 32 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    pinHash: varchar("pin_hash", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    allowInteractive: boolean("allow_interactive").notNull().default(true),
    allowVideoDownload: boolean("allow_video_download").notNull().default(false),
    allowChapterNavigation: boolean("allow_chapter_navigation").notNull().default(true),
    isRevoked: boolean("is_revoked").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("walkthrough_share_links_token_uidx").on(t.tokenHash),
    uniqueIndex("walkthrough_share_links_public_uidx").on(t.publicToken),
    index("walkthrough_share_links_tenant_idx").on(t.tenantId),
  ],
);

export const walkthroughSessions = pgTable(
  "walkthrough_sessions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id")
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    shareLinkId: uuid("share_link_id").references(() => walkthroughShareLinks.id, {
      onDelete: "set null",
    }),
    mode: varchar("mode", { length: 32 }).notNull().default("interactive"),
    voiceProfileId: varchar("voice_profile_id", { length: 120 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastChapterKey: varchar("last_chapter_key", { length: 80 }),
    watchDurationMs: integer("watch_duration_ms").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [index("walkthrough_sessions_tenant_idx").on(t.tenantId, t.walkthroughId)],
);

export const walkthroughEvents = pgTable(
  "walkthrough_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    walkthroughId: uuid("walkthrough_id").references(() => walkthroughs.id, {
      onDelete: "cascade",
    }),
    sessionId: uuid("session_id").references(() => walkthroughSessions.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    chapterKey: varchar("chapter_key", { length: 80 }),
    sceneKey: varchar("scene_key", { length: 80 }),
    payloadJson: jsonb("payload_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("walkthrough_events_tenant_idx").on(t.tenantId, t.eventType),
    index("walkthrough_events_walkthrough_idx").on(t.walkthroughId, t.createdAt),
  ],
);

export const demoSeedVersions = pgTable(
  "demo_seed_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    seedKey: varchar("seed_key", { length: 80 }).notNull().default("default"),
    version: varchar("version", { length: 32 }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    seededAt: timestamp("seeded_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("demo_seed_versions_uidx").on(t.tenantId, t.seedKey, t.version),
    index("demo_seed_versions_active_idx").on(t.tenantId, t.isActive),
  ],
);

export type WalkthroughRow = typeof walkthroughs.$inferSelect;
export type WalkthroughVersionRow = typeof walkthroughVersions.$inferSelect;
export type WalkthroughChapterRow = typeof walkthroughChapters.$inferSelect;
export type WalkthroughSceneRow = typeof walkthroughScenes.$inferSelect;
export type WalkthroughVideoExportRow = typeof walkthroughVideoExports.$inferSelect;
export type WalkthroughShareLinkRow = typeof walkthroughShareLinks.$inferSelect;
export type WalkthroughSessionRow = typeof walkthroughSessions.$inferSelect;
export type WalkthroughEventRow = typeof walkthroughEvents.$inferSelect;
export type DemoSeedVersionRow = typeof demoSeedVersions.$inferSelect;
