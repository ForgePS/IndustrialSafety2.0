#!/usr/bin/env node
/**
 * Bootstrap the first platform super administrator.
 *
 * Usage:
 *   pnpm platform:bootstrap-admin --cognito-sub "..." --email "a@b.c" --first-name "Ada" --last-name "Lovelace"
 *
 * Requires DATABASE_URL (or Secrets Manager resolution via env) and APP_ENV != production
 * unless --confirm-production is passed (future).
 */
import { createHash, randomBytes } from "node:crypto";
import { PLATFORM_PERMISSIONS } from "@forge/contracts";
import {
  authenticationIdentities,
  createDatabase,
  createId,
  persons,
  roleTemplates,
  roles,
  tenants,
  userRoleAssignments,
  users,
  userTenantAccess,
} from "@forge/database";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    console.error(`Missing required --${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const cognitoSub = requireArg("cognito-sub");
  const email = requireArg("email").toLowerCase();
  const firstName = requireArg("first-name");
  const lastName = requireArg("last-name");

  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  if (env.APP_ENV === "production" && !process.argv.includes("--confirm-production")) {
    console.error("Refusing to bootstrap production without --confirm-production");
    process.exit(1);
  }

  const db = createDatabase(env.DATABASE_URL);
  const now = new Date();

  const platformTenantKey = "forge-platform";
  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.tenantKey, platformTenantKey))
    .limit(1);
  if (!tenant) {
    const tenantId = createId();
    await db.insert(tenants).values({
      id: tenantId,
      tenantKey: platformTenantKey,
      slug: "forge-platform",
      legalName: "Forge Public Safety",
      displayName: "Forge Platform",
      tenantType: "PLATFORM",
      status: "ACTIVE",
      timezone: "America/Chicago",
      defaultLocale: "en-US",
      dataRegion: env.AWS_REGION,
      createdAt: now,
      updatedAt: now,
    });
    [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  }

  if (!tenant) {
    throw new Error("Failed to resolve platform tenant");
  }

  let [identity] = await db
    .select()
    .from(authenticationIdentities)
    .where(
      and(
        eq(authenticationIdentities.provider, "COGNITO"),
        eq(authenticationIdentities.providerSubject, cognitoSub),
      ),
    )
    .limit(1);

  let userId = identity?.userId;
  let personId: string | null = null;

  if (!userId) {
    personId = createId();
    userId = createId();
    const identityId = createId();
    const forgePersonNumber = `FP-${randomBytes(3).toString("hex").toUpperCase()}`;

    await db.insert(persons).values({
      id: personId,
      tenantId: tenant.id,
      forgePersonNumber,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email,
      status: "ACTIVE",
      recordSource: "BOOTSTRAP",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: userId,
      tenantId: tenant.id,
      personId,
      primaryEmail: email,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(authenticationIdentities).values({
      id: identityId,
      tenantId: tenant.id,
      userId,
      provider: "COGNITO",
      providerSubject: cognitoSub,
      emailAtLinkTime: email,
      createdAt: now,
    });

    await db.insert(userTenantAccess).values({
      id: createId(),
      tenantId: tenant.id,
      userId,
      status: "ACTIVE",
      isDefaultTenant: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [template] = await db
    .select()
    .from(roleTemplates)
    .where(eq(roleTemplates.code, "PLATFORM_SUPER_ADMIN"))
    .limit(1);

  if (!template) {
    console.error("Run db:seed before bootstrap-admin (PLATFORM_SUPER_ADMIN missing)");
    process.exit(1);
  }

  let [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenant.id), eq(roles.code, "PLATFORM_SUPER_ADMIN")))
    .limit(1);

  if (!role) {
    const roleId = createId();
    await db.insert(roles).values({
      id: roleId,
      tenantId: tenant.id,
      roleTemplateId: template.id,
      code: "PLATFORM_SUPER_ADMIN",
      name: "Platform Super Admin",
      description: "Bootstrap platform administrator",
      status: "ACTIVE",
      isSystemManaged: true,
      createdAt: now,
      updatedAt: now,
    });
    [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  }

  if (!role || !userId) {
    throw new Error("Failed to resolve role/user for bootstrap");
  }

  const [existingAssignment] = await db
    .select()
    .from(userRoleAssignments)
    .where(
      and(
        eq(userRoleAssignments.tenantId, tenant.id),
        eq(userRoleAssignments.userId, userId),
        eq(userRoleAssignments.roleId, role.id),
      ),
    )
    .limit(1);

  if (!existingAssignment) {
    await db.insert(userRoleAssignments).values({
      id: createId(),
      tenantId: tenant.id,
      userId,
      roleId: role.id,
      grantedByUserId: userId,
      reason: "platform bootstrap",
      createdAt: now,
    });
  }

  // Fingerprint only — never print tokens/secrets
  const emailFingerprint = createHash("sha256").update(email).digest("hex").slice(0, 12);
  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: tenant.id,
        userId,
        personId,
        emailFingerprint,
        permissionsSeeded: PLATFORM_PERMISSIONS.length,
        role: "PLATFORM_SUPER_ADMIN",
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
