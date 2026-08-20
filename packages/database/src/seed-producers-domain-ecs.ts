/**
 * Idempotent map of Producers Rice Mill vanity hosts → production tenant.
 *
 *   TENANT_ID=019ff7d0-c20f-7659-81e4-c0cd68e23262 \
 *   DOMAIN=producersrice.forgepublicsafety.com \
 *   node packages/database/dist/seed-producers-domain-ecs.js
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import { tenantDomains, tenants } from "./schema.js";

/** Live production Producers Rice Mill tenant. */
export const PRODUCERS_PRODUCTION_TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";

export const PRODUCERS_VANITY_HOSTS = [
  "producersrice.forgepublicsafety.com",
  "producers-rice-mill.forgepublicsafety.com",
] as const;

export async function seedProducersDomain(options?: {
  databaseUrl?: string;
  tenantId?: string;
  domains?: readonly string[];
}): Promise<Array<{ domain: string; tenantId: string; created: boolean }>> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const connectionString = options?.databaseUrl ?? env.DATABASE_URL;
  const tenantId = options?.tenantId ?? PRODUCERS_PRODUCTION_TENANT_ID;
  const domains = options?.domains ?? PRODUCERS_VANITY_HOSTS;
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date();
  const results: Array<{ domain: string; tenantId: string; created: boolean }> = [];

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    for (const rawDomain of domains) {
      const domain = rawDomain.trim().toLowerCase();
      const [existing] = await db
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.domain, domain))
        .limit(1);

      if (existing) {
        if (existing.tenantId !== tenantId) {
          throw new Error(
            `Domain ${domain} already mapped to tenant ${existing.tenantId}, expected ${tenantId}`,
          );
        }
        if (existing.verificationStatus !== "VERIFIED") {
          await db
            .update(tenantDomains)
            .set({
              verificationStatus: "VERIFIED",
              verifiedAt: now,
              updatedAt: now,
            })
            .where(eq(tenantDomains.id, existing.id));
        }
        results.push({ domain, tenantId, created: false });
        continue;
      }

      await db.insert(tenantDomains).values({
        id: createId(),
        tenantId,
        domain,
        domainType: "CUSTOM",
        verificationStatus: "VERIFIED",
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      results.push({ domain, tenantId, created: true });
    }

    return results;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const singleDomain = process.env.DOMAIN?.trim().toLowerCase();
  const domains = singleDomain ? ([singleDomain] as const) : undefined;
  const tenantId = process.env.TENANT_ID?.trim();
  const result = await seedProducersDomain({
    ...(tenantId ? { tenantId } : {}),
    ...(domains ? { domains } : {}),
  });
  console.info(JSON.stringify({ status: "ok", results: result }));
}

const isMain =
  process.argv[1]?.endsWith("seed-producers-domain-ecs.ts") ||
  process.argv[1]?.endsWith("seed-producers-domain-ecs.js");

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
