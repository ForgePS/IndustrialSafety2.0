import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { createId } from "./ids.js";
export * from "./identity-lookup.js";
export { hashLegalContent, seedLegalAcknowledgments } from "./seed-legal-acknowledgments.js";
export {
  alterRolePassword,
  ensureAppLoginRole,
  redactCredentialError,
} from "./safe-admin.js";

export type Database = ReturnType<typeof createDatabase>;

export type DatabaseTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

const sharedDatabases = new Map<string, Database>();

/**
 * Process-wide shared drizzle client. Prefer this in long-running workers so
 * each job does not open a new postgres.js pool (max 10) that is never closed.
 */
export function getSharedDatabase(connectionString: string): Database {
  const existing = sharedDatabases.get(connectionString);
  if (existing) return existing;
  const db = createDatabase(connectionString);
  sharedDatabases.set(connectionString, db);
  return db;
}

export async function checkDatabaseHealth(connectionString: string): Promise<boolean> {
  const client = postgres(connectionString, { max: 1 });
  try {
    await client`select 1`;
    return true;
  } finally {
    await client.end({ timeout: 5 });
  }
}

/** Prepares PostgreSQL session tenant context for RLS. */
export async function setTenantContext(
  sqlClient: postgres.Sql,
  tenantId: string,
  userId?: string,
): Promise<void> {
  await sqlClient`select set_config('app.current_tenant_id', ${tenantId}, true)`;
  if (userId) {
    await sqlClient`select set_config('app.current_user_id', ${userId}, true)`;
  }
}

/**
 * Begins a transaction, sets tenant (and optional user) session context via
 * SET LOCAL semantics (`set_config(..., true)`), then runs the callback.
 */
export async function withTenantTransaction<T>(
  db: Database,
  tenantId: string,
  callback: (tx: DatabaseTransaction) => Promise<T>,
  userId?: string,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    if (userId) {
      await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    }
    return callback(tx);
  });
}

/**
 * Platform-admin analytics / system jobs: sets transaction-local `app.bypass_rls=on`.
 * Only tables whose RLS policies honor bypass will return cross-tenant rows.
 * Callers must enforce creator-only authorization before invoking.
 */
export async function withBypassRlsTransaction<T>(
  db: Database,
  callback: (tx: DatabaseTransaction) => Promise<T>,
  userId?: string,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'on', true)`);
    if (userId) {
      await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    }
    return callback(tx);
  });
}
