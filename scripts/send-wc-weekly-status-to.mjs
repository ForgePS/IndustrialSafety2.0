#!/usr/bin/env node
/**
 * One-off (runs inside the platform-api image from /app/apps/platform-api):
 * send the Workers' Comp weekly status email for one tenant to an explicit
 * recipient list only. Saved recipients are not changed or emailed.
 *
 * Env: TENANT_KEY (default producers-rice-mill), RECIPIENTS (comma-separated, required)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import {
  tenants,
  userTenantMemberships,
  users,
  withBypassRlsTransaction,
} from "@forge/database";
import { and, eq, sql } from "drizzle-orm";

const DIST = "/app/apps/platform-api/dist";
const { AppModule } = await import(`${DIST}/app.module.js`);
const { DATABASE } = await import(`${DIST}/tokens.js`);
const { IndustrialDomainService } = await import(
  `${DIST}/modules/industrial/industrial-domain.service.js`
);

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const recipients = String(process.env.RECIPIENTS || "")
  .split(/[,;\s]+/)
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
if (recipients.length === 0) throw new Error("RECIPIENTS is required");

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const app = await NestFactory.createApplicationContext(AppModule.register(env), { logger: false });
try {
  const db = app.get(DATABASE);
  const { tenantId, userId } = await withBypassRlsTransaction(db, async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantKey, TENANT_KEY))
      .limit(1);
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const [preferred] = await tx
      .select({ userId: userTenantMemberships.userId })
      .from(userTenantMemberships)
      .innerJoin(users, eq(users.id, userTenantMemberships.userId))
      .where(
        and(
          eq(userTenantMemberships.tenantId, tenant.id),
          eq(userTenantMemberships.status, "ACTIVE"),
          sql`lower(${users.primaryEmail}) = ${recipients[0]}`,
        ),
      )
      .limit(1);
    const [anyMember] = preferred
      ? [preferred]
      : await tx
          .select({ userId: userTenantMemberships.userId })
          .from(userTenantMemberships)
          .where(
            and(
              eq(userTenantMemberships.tenantId, tenant.id),
              eq(userTenantMemberships.status, "ACTIVE"),
            ),
          )
          .limit(1);
    if (!anyMember) throw new Error("No active tenant member to act as sender");
    return { tenantId: tenant.id, userId: anyMember.userId };
  });

  const principal = {
    authenticationIdentityId: "system:workers-comp-weekly-status-oneoff",
    userId,
    personId: null,
    tenantId,
    organizationIds: [],
    permissions: new Set(["industrial.admin", "industrial.access"]),
    activeProducts: new Set(["FORGE_INDUSTRIAL"]),
    activeModules: new Set(),
    correlationId: `wc-weekly-oneoff-${Date.now()}`,
    requestId: `wc-weekly-oneoff-${Date.now()}`,
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };

  const domain = app.get(IndustrialDomainService);
  const outcome = await domain.sendWorkersCompWeeklyStatus(principal, { recipients });
  console.log(
    JSON.stringify({
      tenantKey: TENANT_KEY,
      subject: outcome.subject,
      openCount: outcome.openCount,
      recipientCount: outcome.recipientCount,
      acceptedCount: outcome.acceptedCount,
      results: outcome.results,
    }),
  );
} finally {
  await app.close();
}
// Nest providers keep handles open after close; the one-off task must exit.
process.exit(0);
