/**
 * Seed Import Platform S8 evidence personas on acceptance tenants (forge_admin).
 * Synthetic emails only — no real credentials.
 *
 * ECS: node /app/packages/database/dist/seed-import-s8-personas.js
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
  membershipModuleAccess,
  membershipProductAccess,
  membershipRoleAssignments,
  permissions,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  tenantModuleEntitlements,
  tenantProducts,
  tenants,
  userTenantMemberships,
  users,
} from "./schema.js";
import { seedPlatformData } from "./seed.js";

const TENANT_A_KEY = "import-acceptance-tenant-a";
const TENANT_B_KEY = "import-acceptance-tenant-b";

const ALL_IMPORT = [
  "import.view",
  "import.upload",
  "import.map",
  "import.validate",
  "import.preview",
  "import.approve",
  "import.execute",
  "import.rollback",
  "import.profile.manage",
  "import.template.manage",
  "import.error.reprocess",
  "import.sensitive",
] as const;

type PersonaDef = {
  key: string;
  email: string;
  roleCode: string;
  permissions: readonly string[];
};

const PERSONAS: PersonaDef[] = [
  {
    key: "operator",
    email: "s8-import-operator@forge.test",
    roleCode: "S8_IMPORT_OPERATOR",
    permissions: [
      "import.view",
      "import.upload",
      "import.map",
      "import.validate",
      "import.preview",
      "import.profile.manage",
      "import.template.manage",
    ],
  },
  {
    key: "approver",
    email: "s8-import-approver@forge.test",
    roleCode: "S8_IMPORT_APPROVER",
    permissions: ["import.view", "import.approve", "import.preview"],
  },
  {
    key: "executor",
    email: "s8-import-executor@forge.test",
    roleCode: "S8_IMPORT_EXECUTOR",
    permissions: ["import.view", "import.execute", "import.preview"],
  },
  {
    key: "full",
    email: "s8-import-full@forge.test",
    roleCode: "S8_IMPORT_FULL",
    permissions: ALL_IMPORT,
  },
  {
    key: "viewer",
    email: "s8-import-viewer@forge.test",
    roleCode: "S8_IMPORT_VIEWER",
    permissions: ["import.view"],
  },
  {
    key: "sensitive",
    email: "s8-import-sensitive@forge.test",
    roleCode: "S8_IMPORT_SENSITIVE",
    permissions: ["import.view", "import.sensitive", "import.preview"],
  },
  {
    key: "rollback",
    email: "s8-import-rollback@forge.test",
    roleCode: "S8_IMPORT_ROLLBACK",
    permissions: ["import.view", "import.rollback"],
  },
  {
    key: "reprocess",
    email: "s8-import-reprocess@forge.test",
    roleCode: "S8_IMPORT_REPROCESS",
    permissions: ["import.view", "import.error.reprocess"],
  },
  {
    key: "unauthorized",
    email: "s8-import-unauthorized@forge.test",
    roleCode: "S8_IMPORT_UNAUTHORIZED",
    permissions: ["platform.permission.read"],
  },
];

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
      where: and(eq(rolePermissions.roleId, roleId!), eq(rolePermissions.permissionId, perm.id)),
    });
    if (!link) {
      await db.insert(rolePermissions).values({
        roleId: roleId!,
        permissionId: perm.id,
        effect: "ALLOW",
        createdAt: now,
      });
    }
  }
  return roleId!;
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
  const assignment = await db.query.membershipRoleAssignments.findFirst({
    where: and(
      eq(membershipRoleAssignments.membershipId, membership!.id),
      eq(membershipRoleAssignments.roleId, roleId),
    ),
  });
  if (!assignment) {
    await db.insert(membershipRoleAssignments).values({
      id: createId(),
      tenantId,
      membershipId: membership!.id,
      roleId,
      status: "ACTIVE",
      grantedByUserId: userId,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const product = await db.query.platformProducts.findFirst({
    where: eq(platformProducts.code, "FORGE_RMS"),
  });
  const module = await db.query.platformModules.findFirst({
    where: and(eq(platformModules.productId, product?.id ?? ""), eq(platformModules.code, "CORE")),
  });
  if (product) {
    const tp = await db.query.tenantProducts.findFirst({
      where: and(eq(tenantProducts.tenantId, tenantId), eq(tenantProducts.productId, product.id)),
    });
    if (!tp) {
      await db.insert(tenantProducts).values({
        id: createId(),
        tenantId,
        productId: product.id,
        status: "ACTIVE",
        enabledAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    const mpa = await db.query.membershipProductAccess.findFirst({
      where: and(
        eq(membershipProductAccess.membershipId, membership!.id),
        eq(membershipProductAccess.productId, product.id),
      ),
    });
    if (!mpa) {
      await db.insert(membershipProductAccess).values({
        id: createId(),
        tenantId,
        membershipId: membership!.id,
        productId: product.id,
        status: "ACTIVE",
        grantedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (module && product) {
    const tme = await db.query.tenantModuleEntitlements.findFirst({
      where: and(
        eq(tenantModuleEntitlements.tenantId, tenantId),
        eq(tenantModuleEntitlements.moduleId, module.id),
      ),
    });
    if (!tme) {
      await db.insert(tenantModuleEntitlements).values({
        id: createId(),
        tenantId,
        moduleId: module.id,
        status: "ACTIVE",
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    const mma = await db.query.membershipModuleAccess.findFirst({
      where: and(
        eq(membershipModuleAccess.membershipId, membership!.id),
        eq(membershipModuleAccess.moduleId, module.id),
      ),
    });
    if (!mma) {
      await db.insert(membershipModuleAccess).values({
        id: createId(),
        tenantId,
        membershipId: membership!.id,
        moduleId: module.id,
        status: "ACTIVE",
        grantedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return userId;
}

async function seedTenantPersonas(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tenantKey: string,
): Promise<{
  tenantId: string;
  personas: Record<string, { userId: string; email: string; roleCode: string }>;
}> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.tenantKey, tenantKey) });
  if (!tenant) throw new Error(`Missing tenant ${tenantKey} — run acceptance tenant seed first`);
  const personas: Record<string, { userId: string; email: string; roleCode: string }> = {};
  for (const p of PERSONAS) {
    const roleId = await ensureRole(db, tenant.id, p.roleCode, p.permissions);
    const userId = await ensureUser(db, tenant.id, p.email, roleId);
    personas[p.key] = { userId, email: p.email, roleCode: p.roleCode };
  }
  return { tenantId: tenant.id, personas };
}

export async function seedImportS8Personas(): Promise<{
  ok: true;
  tenantA: Awaited<ReturnType<typeof seedTenantPersonas>>;
  tenantB: Awaited<ReturnType<typeof seedTenantPersonas>>;
}> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await seedPlatformData(db);
    const tenantA = await seedTenantPersonas(db, TENANT_A_KEY);
    const tenantB = await seedTenantPersonas(db, TENANT_B_KEY);
    return { ok: true, tenantA, tenantB };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const result = await seedImportS8Personas();
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify(result));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-import-s8-personas.ts") ||
  process.argv[1]?.endsWith("seed-import-s8-personas.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
