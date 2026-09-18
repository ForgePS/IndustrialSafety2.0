import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Browser BFF sessions (FIS-H01): opaque HttpOnly cookie maps to a hashed session
 * token; Cognito refresh tokens are stored encrypted server-side only.
 */
export const authBrowserSessions = pgTable(
  "auth_browser_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    homeTenantId: uuid("home_tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionTokenHash: varchar("session_token_hash", { length: 128 }).notNull(),
    /** AES-GCM ciphertext of the Cognito refresh token (base64). */
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    refreshTokenNonce: varchar("refresh_token_nonce", { length: 64 }).notNull(),
    csrfTokenHash: varchar("csrf_token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    rotatedFromSessionId: uuid("rotated_from_session_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_browser_sessions_token_uidx").on(t.sessionTokenHash),
  ],
);
