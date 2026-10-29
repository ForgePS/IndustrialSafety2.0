import { ForgeError } from "@forge/errors";
import { isIndustrialDemoTenantKey } from "@forge/contracts";
import { eq } from "drizzle-orm";
import { tenants, type Database } from "@forge/database";

const cache = new Map<string, { value: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function isDemoTenant(
  db: Database,
  tenantId: string | null | undefined,
): Promise<boolean> {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;

  const cached = cache.get(id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const rows = await db
    .select({ isDemoTenant: tenants.isDemoTenant })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  const value = Boolean(rows[0]?.isDemoTenant);
  cache.set(id, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Synthetic demo seed / Enable Demo / Reset Demo are restricted to Forge
 * Platform demo tenants only — never customer pilots like producers-rice-mill.
 */
export async function assertTenantAllowedForDemoSeed(
  db: Database,
  tenantId: string | null | undefined,
): Promise<{ tenantKey: string; slug: string }> {
  const id = String(tenantId ?? "").trim();
  if (!id) {
    throw new ForgeError("VALIDATION_FAILED", "Tenant is required for demo seed");
  }
  const rows = await db
    .select({
      tenantKey: tenants.tenantKey,
      slug: tenants.slug,
      isDemoTenant: tenants.isDemoTenant,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ForgeError("NOT_FOUND", "Tenant not found");
  if (!isIndustrialDemoTenantKey(row.tenantKey) && !isIndustrialDemoTenantKey(row.slug)) {
    throw new ForgeError(
      "VALIDATION_FAILED",
      "Demo seed and Enable Demo Mode are only allowed on Forge Platform demo tenants (forge-platform / forge-industrial-demo)",
    );
  }
  return { tenantKey: row.tenantKey, slug: row.slug };
}

/**
 * Executive Walkthrough / Walkthrough Studio / walkthrough logo — Forge Platform
 * demo tenants only (forge-platform / forge-industrial-demo, or is_demo_tenant).
 */
export async function assertWalkthroughTenantAllowed(
  db: Database,
  tenantId: string | null | undefined,
): Promise<{ tenantKey: string; slug: string }> {
  const id = String(tenantId ?? "").trim();
  if (!id) {
    throw new ForgeError("VALIDATION_FAILED", "Tenant is required for walkthrough");
  }
  const rows = await db
    .select({
      tenantKey: tenants.tenantKey,
      slug: tenants.slug,
      isDemoTenant: tenants.isDemoTenant,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ForgeError("NOT_FOUND", "Tenant not found");
  const allowed =
    Boolean(row.isDemoTenant) ||
    isIndustrialDemoTenantKey(row.tenantKey) ||
    isIndustrialDemoTenantKey(row.slug);
  if (!allowed) {
    throw new ForgeError(
      "FORBIDDEN",
      "Executive Walkthrough and Walkthrough Studio are only available on the Forge Platform demo tenant",
    );
  }
  return { tenantKey: row.tenantKey, slug: row.slug };
}

/** True when a request asks to push DOT/compliance data outside Forge. */
export function requestsExternalDotSync(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  const keys = [
    "externalSync",
    "submitExternal",
    "pushExternal",
    "fmcsaSubmit",
    "clearinghouseSubmit",
    "vendorSync",
    "dotExternalSubmit",
  ];
  return keys.some((key) => body[key] === true || String(body[key] ?? "").toLowerCase() === "true");
}

/**
 * Blocks outbound DOT / compliance vendor side effects for demo tenants.
 * Local record edits remain allowed.
 */
export async function assertDemoAllowsDotExternal(
  db: Database,
  tenantId: string | null | undefined,
  body?: Record<string, unknown> | null,
): Promise<void> {
  if (!(await isDemoTenant(db, tenantId))) return;
  if (body && !requestsExternalDotSync(body)) return;
  if (!body) {
    throw new ForgeError("VALIDATION_FAILED", "External DOT updates are blocked for demo tenants");
  }
  throw new ForgeError("VALIDATION_FAILED", "External DOT updates are blocked for demo tenants");
}

/** Test / admin helper to clear the short TTL cache. */
export function clearDemoTenantCache(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}
