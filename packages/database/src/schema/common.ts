import { integer, timestamp } from "drizzle-orm/pg-core";

/** Shared timestamptz columns. App may set explicitly; DB default is now(). */
export const createdAtColumn = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();

export const updatedAtColumn = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull();

/**
 * Optimistic concurrency counter (ADR-023). Incremented in the same UPDATE that
 * mutates the row; surfaced to clients as the weak ETag `W/"<record_version>"`.
 */
export const recordVersionColumn = integer("record_version").notNull().default(1);

/**
 * Email and slug columns use varchar here for Drizzle simplicity.
 * Migration SQL creates matching columns as citext where case-insensitive
 * uniqueness is required (emails, slugs, domains, tenant_key).
 */
