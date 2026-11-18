/**
 * Seed Configuration Platform authorization personas on the RMS synthetic FD tenant.
 *
 * Usage (ECS one-off with forge_admin secret):
 *   node /app/packages/database/dist/seed-config-auth-personas.js
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import {
  membershipRoleAssignments,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userTenantMemberships,
  users,
} from "./schema.js";
import { seedPlatformData } from "./seed.js";

export const CONFIG_AUTH_TENANT_KEY = "rms-synthetic-fd";

const PERSONAS = [
  {
    key: "platform_support",
    email: "config-platform-support@forge.test",
    roleCode: "CONFIG_PLATFORM_SUPPORT",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "platform.person.read",
      "platform.permission.read",
      "platform.audit.read",
      "platform.configuration.update",
      "platform.configuration.publish",
    ],
  },
  {
    key: "tenant_admin",
    email: "config-tenant-admin@forge.test",
    roleCode: "CONFIG_TENANT_ADMIN",
    permissions: [
      "platform.tenant.read",
      "platform.tenant.update",
      "platform.organization.read",
      "platform.permission.read",
      "platform.audit.read",
      "tenant.configuration.update",
      "tenant.configuration.publish",
    ],
  },
  {
    key: "configuration_manager",
    email: "config-manager@forge.test",
    roleCode: "CONFIG_CONFIGURATION_MANAGER",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "platform.permission.read",
      "platform.audit.read",
      "tenant.configuration.update",
      "tenant.configuration.publish",
    ],
  },
  {
    key: "read_only_auditor",
    email: "config-auditor@forge.test",
    roleCode: "CONFIG_READ_ONLY_AUDITOR",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "platform.person.read",
      "platform.permission.read",
      "platform.audit.read",
    ],
  },
  {
    key: "standard_user",
    email: "config-standard@forge.test",
    roleCode: "CONFIG_STANDARD_USER",
    permissions: ["platform.organization.read", "platform.person.read", "platform.permission.read"],
  },
  {
    key: "update_only",
    email: "config-update-only@forge.test",
    roleCode: "CONFIG_UPDATE_ONLY",
    permissions: ["platform.configuration.update", "platform.tenant.read"],
  },
  {
    key: "publish_only",
    email: "config-publish-only@forge.test",
    roleCode: "CONFIG_PUBLISH_ONLY",
    permissions: ["platform.configuration.publish", "platform.tenant.read"],
  },
] as const;

export type ConfigAuthPersonaSeedResult = {
  tenantId: string;
  personas: Record<string, { userId: string; email: string; roleCode: string }>;
};

async function ensureRole(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tenantId: string,
  code: string,
  permissionCodes: readonly string[],
): Promise<string> {
  const existing = await db.query.roles.findFirst({
    where: and(eq(roles.tenantId, tenantId), eq(roles.code, code)),
  });
  const now = new Date();
  let roleId = existing?.id;
  if (!roleId) {
    roleId = createId();
    await db.insert(roles).values({
      id: roleId,
      tenantId,
      code,
      name: code,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }

  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, [...permissionCodes]));

  for (const perm of permRows) {
    const link = await db.query.rolePermissions.findFirst({
      where: and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, perm.id)),
    });
    if (!link) {
      await db.insert(rolePermissions).values({
        roleId,
        permissionId: perm.id,
        effect: "ALLOW",
        createdAt: now,
      });
    }
  }
  return roleId;
}

async function ensureUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tenantId: string,
  email: string,
  roleId: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.primaryEmail, normalized)),
  });
  const now = new Date();
  let userId = existing?.id;
  if (!userId) {
    userId = createId();
    await db.insert(users).values({
      id: userId,
      tenantId,
      primaryEmail: normalized,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  let membership = await db.query.userTenantMemberships.findFirst({
    where: and(
      eq(userTenantMemberships.tenantId, tenantId),
      eq(userTenantMemberships.userId, userId),
    ),
  });
  if (!membership) {
    const membershipId = createId();
    await db.insert(userTenantMemberships).values({
      id: membershipId,
      tenantId,
      userId,
      status: "ACTIVE",
      isDefaultTenant: true,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    membership = await db.query.userTenantMemberships.findFirst({
      where: eq(userTenantMemberships.id, membershipId),
    });
  }

  if (!membership) {
    throw new Error(`Failed to ensure membership for ${email}`);
  }

  const assignment = await db.query.membershipRoleAssignments.findFirst({
    where: and(
      eq(membershipRoleAssignments.membershipId, membership.id),
      eq(membershipRoleAssignments.roleId, roleId),
      eq(membershipRoleAssignments.status, "ACTIVE"),
    ),
  });
  if (!assignment) {
    await db.insert(membershipRoleAssignments).values({
      id: createId(),
      tenantId,
      membershipId: membership.id,
      roleId,
      status: "ACTIVE",
      grantedByUserId: userId,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return userId;
}

export async function seedConfigAuthPersonas(options?: {
  databaseUrl?: string;
}): Promise<ConfigAuthPersonaSeedResult> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const url = options?.databaseUrl ?? env.DATABASE_URL;
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    await seedPlatformData(db);

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.tenantKey, CONFIG_AUTH_TENANT_KEY),
    });
    if (!tenant) {
      throw new Error(`Tenant ${CONFIG_AUTH_TENANT_KEY} not found — seed RMS synthetic first`);
    }

    const personas: ConfigAuthPersonaSeedResult["personas"] = {};
    for (const persona of PERSONAS) {
      const roleId = await ensureRole(db, tenant.id, persona.roleCode, persona.permissions);
      const userId = await ensureUser(db, tenant.id, persona.email, roleId);
      personas[persona.key] = {
        userId,
        email: persona.email,
        roleCode: persona.roleCode,
      };
    }

    return { tenantId: tenant.id, personas };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const result = await seedConfigAuthPersonas();
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify({ ok: true, ...result }, null, 2));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-config-auth-personas.ts") ||
  process.argv[1]?.endsWith("seed-config-auth-personas.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
