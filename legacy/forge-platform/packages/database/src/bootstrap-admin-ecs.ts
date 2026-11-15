/**
 * One-off ECS bootstrap for the synthetic platform administrator used in
 * development acceptance (Sprint 1E Wave 10).
 *
 * Command: node /app/packages/database/dist/bootstrap-admin-ecs.js
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import {
  authenticationIdentities,
  membershipRoleAssignments,
  permissions,
  persons,
  rolePermissions,
  roleTemplatePermissions,
  roleTemplates,
  roles,
  tenants,
  userRoleAssignments,
  users,
  userTenantAccess,
  userTenantMemberships,
} from "./schema.js";

function bootstrapIdentity(): {
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
} {
  return {
    cognitoSub: process.env.BOOTSTRAP_COGNITO_SUB?.trim() || "sprint-1e-dev-admin",
    email: process.env.BOOTSTRAP_EMAIL?.trim() || "platform.admin@forge.local",
    firstName: process.env.BOOTSTRAP_FIRST_NAME?.trim() || "Platform",
    lastName: process.env.BOOTSTRAP_LAST_NAME?.trim() || "Admin",
  };
}

export async function runBootstrapAdmin(): Promise<void> {
  const {
    cognitoSub: COGNITO_SUB,
    email: EMAIL,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
  } = bootstrapIdentity();
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date();

  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.tenantKey, "forge-platform"))
    .limit(1);
  if (!tenant) {
    const tenantId = createId();
    await db.insert(tenants).values({
      id: tenantId,
      tenantKey: "forge-platform",
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

  const [identity] = await db
    .select()
    .from(authenticationIdentities)
    .where(
      and(
        eq(authenticationIdentities.provider, "COGNITO"),
        eq(authenticationIdentities.providerSubject, COGNITO_SUB),
      ),
    )
    .limit(1);

  let userId = identity?.userId;
  if (!userId) {
    const personId = createId();
    userId = createId();
    await db.insert(persons).values({
      id: personId,
      tenantId: tenant.id,
      forgePersonNumber: `FP-${randomBytes(3).toString("hex").toUpperCase()}`,
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      displayName: `${FIRST_NAME} ${LAST_NAME}`,
      email: EMAIL,
      status: "ACTIVE",
      recordSource: "BOOTSTRAP",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(users).values({
      id: userId,
      tenantId: tenant.id,
      personId,
      primaryEmail: EMAIL,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(authenticationIdentities).values({
      id: createId(),
      tenantId: tenant.id,
      userId,
      provider: "COGNITO",
      providerSubject: COGNITO_SUB,
      emailAtLinkTime: EMAIL,
      createdAt: now,
      lastAuthenticatedAt: now,
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

  // Ensure the Sprint 1E membership aggregate exists (auth/me uses forge_lookup_user_tenants).
  let [membership] = await db
    .select()
    .from(userTenantMemberships)
    .where(
      and(eq(userTenantMemberships.tenantId, tenant.id), eq(userTenantMemberships.userId, userId!)),
    )
    .limit(1);
  if (!membership) {
    const membershipId = createId();
    await db.insert(userTenantMemberships).values({
      id: membershipId,
      tenantId: tenant.id,
      userId: userId!,
      status: "ACTIVE",
      isDefaultTenant: true,
      activatedAt: now,
      createdByUserId: userId!,
      updatedByUserId: userId!,
      createdAt: now,
      updatedAt: now,
    });
    [membership] = await db
      .select()
      .from(userTenantMemberships)
      .where(eq(userTenantMemberships.id, membershipId))
      .limit(1);
  }

  const [template] = await db
    .select()
    .from(roleTemplates)
    .where(eq(roleTemplates.code, "PLATFORM_SUPER_ADMIN"))
    .limit(1);
  if (!template) {
    throw new Error("PLATFORM_SUPER_ADMIN role template missing — run seed first");
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
    const templatePerms = await db
      .select({ permissionId: roleTemplatePermissions.permissionId })
      .from(roleTemplatePermissions)
      .where(eq(roleTemplatePermissions.roleTemplateId, template.id));
    for (const row of templatePerms) {
      await db
        .insert(rolePermissions)
        .values({
          roleId,
          permissionId: row.permissionId,
          effect: "ALLOW",
          createdAt: now,
        })
        .onConflictDoNothing();
    }
    // Ensure creator permissions exist even if template rows are incomplete.
    const allPerms = await db
      .select({ id: permissions.id, code: permissions.code })
      .from(permissions);
    for (const perm of allPerms) {
      if (perm.code.startsWith("platform.")) {
        await db
          .insert(rolePermissions)
          .values({ roleId, permissionId: perm.id, effect: "ALLOW", createdAt: now })
          .onConflictDoNothing();
      }
    }
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
      reason: "Sprint 1E development bootstrap",
      createdAt: now,
    });
  }

  if (membership) {
    const [existingMembershipRole] = await db
      .select()
      .from(membershipRoleAssignments)
      .where(
        and(
          eq(membershipRoleAssignments.membershipId, membership.id),
          eq(membershipRoleAssignments.roleId, role.id),
        ),
      )
      .limit(1);
    if (!existingMembershipRole) {
      await db.insert(membershipRoleAssignments).values({
        id: createId(),
        tenantId: tenant.id,
        membershipId: membership.id,
        roleId: role.id,
        status: "ACTIVE",
        grantedByUserId: userId,
        grantedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // eslint-disable-next-line no-console -- CLI output for ECS one-off
  console.info(
    JSON.stringify({
      status: "bootstrapped",
      tenantId: tenant.id,
      userId,
      membershipId: membership?.id ?? null,
      email: EMAIL,
      cognitoSub: COGNITO_SUB,
      fingerprint: createHash("sha256").update(`${tenant.id}:${userId}`).digest("hex").slice(0, 12),
    }),
  );

  await client.end({ timeout: 5 });
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun =
  Boolean(entryFile) &&
  (thisFile === entryFile || thisFile.toLowerCase() === entryFile.toLowerCase());

if (isDirectRun) {
  runBootstrapAdmin().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
