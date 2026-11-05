/**
 * Production UAT bootstrap (PROD-S1C).
 * Command: node dist/provision-prod-uat-ecs.js
 *
 * Requires CONFIRM_PRODUCTION=YES and Cognito subject/email env vars.
 * Creates only synthetic Forge Internal Test tenants — never customer records.
 */
import "reflect-metadata";
import { createHash, randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { seedPlatformData } from "@forge/database/seed";
import {
  authenticationIdentities,
  createId,
  membershipRoleAssignments,
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
  type Database,
} from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, inArray } from "drizzle-orm";
import { AppModule } from "./app.module.js";
import { OnboardingService } from "./modules/onboarding/onboarding.service.js";
import { DATABASE } from "./tokens.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function resolvePlatformPrincipal(db: Database): Promise<ForgePrincipal> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.tenantKey, "forge-platform"))
    .limit(1);
  if (!tenant) throw new Error("Platform tenant missing after bootstrap");
  const [actor] = await db
    .select({ id: users.id, personId: users.personId })
    .from(users)
    .where(eq(users.tenantId, tenant.id))
    .limit(1);
  if (!actor) throw new Error("Platform user missing after bootstrap");
  return {
    authenticationIdentityId: `script:provision-prod-uat:${createId()}`,
    userId: actor.id,
    personId: actor.personId,
    tenantId: tenant.id,
    organizationIds: [],
    permissions: new Set(["platform.onboarding.manage"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: createId(),
    requestId: createId(),
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

async function ensureRoleFromTemplate(
  db: Database,
  tenantId: string,
  templateCode: string,
): Promise<string> {
  const [template] = await db
    .select()
    .from(roleTemplates)
    .where(eq(roleTemplates.code, templateCode))
    .limit(1);
  if (!template) throw new Error(`Role template missing: ${templateCode}`);
  let [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.code, templateCode)))
    .limit(1);
  if (!role) {
    const roleId = createId();
    const now = new Date();
    await db.insert(roles).values({
      id: roleId,
      tenantId,
      roleTemplateId: template.id,
      code: template.code,
      name: template.name,
      description: `UAT ${template.name}`,
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
        .values({ roleId, permissionId: row.permissionId, effect: "ALLOW", createdAt: now })
        .onConflictDoNothing();
    }
    [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  }
  if (!role) throw new Error(`Failed to create role ${templateCode}`);
  return role.id;
}

async function linkCognitoUser(input: {
  db: Database;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  cognitoSub: string;
  roleId: string;
}): Promise<{ userId: string; membershipId: string }> {
  const now = new Date();
  const email = input.email.toLowerCase();
  let [user] = await input.db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, input.tenantId), eq(users.primaryEmail, email)))
    .limit(1);
  if (!user) {
    const personId = createId();
    const userId = createId();
    await input.db.insert(persons).values({
      id: personId,
      tenantId: input.tenantId,
      forgePersonNumber: `UAT-${randomBytes(3).toString("hex").toUpperCase()}`,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      email,
      status: "ACTIVE",
      recordSource: "BOOTSTRAP",
      createdAt: now,
      updatedAt: now,
    });
    await input.db.insert(users).values({
      id: userId,
      tenantId: input.tenantId,
      personId,
      primaryEmail: email,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    [user] = await input.db.select().from(users).where(eq(users.id, userId)).limit(1);
  } else if (user.status !== "ACTIVE") {
    await input.db
      .update(users)
      .set({ status: "ACTIVE", activatedAt: user.activatedAt ?? now, updatedAt: now })
      .where(eq(users.id, user.id));
  }
  if (!user) throw new Error(`Failed to resolve user ${fingerprint(email)}`);

  const [existingIdentity] = await input.db
    .select()
    .from(authenticationIdentities)
    .where(
      and(
        eq(authenticationIdentities.provider, "COGNITO"),
        eq(authenticationIdentities.providerSubject, input.cognitoSub),
      ),
    )
    .limit(1);
  if (!existingIdentity) {
    await input.db.insert(authenticationIdentities).values({
      id: createId(),
      tenantId: input.tenantId,
      userId: user.id,
      provider: "COGNITO",
      providerSubject: input.cognitoSub,
      emailAtLinkTime: email,
      createdAt: now,
      lastAuthenticatedAt: now,
    });
  }

  let [membership] = await input.db
    .select()
    .from(userTenantMemberships)
    .where(
      and(
        eq(userTenantMemberships.tenantId, input.tenantId),
        eq(userTenantMemberships.userId, user.id),
      ),
    )
    .limit(1);
  if (!membership) {
    const membershipId = createId();
    await input.db.insert(userTenantMemberships).values({
      id: membershipId,
      tenantId: input.tenantId,
      userId: user.id,
      status: "ACTIVE",
      isDefaultTenant: true,
      activatedAt: now,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    [membership] = await input.db
      .select()
      .from(userTenantMemberships)
      .where(eq(userTenantMemberships.id, membershipId))
      .limit(1);
  } else if (membership.status !== "ACTIVE") {
    await input.db
      .update(userTenantMemberships)
      .set({ status: "ACTIVE", activatedAt: membership.activatedAt ?? now, updatedAt: now })
      .where(eq(userTenantMemberships.id, membership.id));
  }
  if (!membership) throw new Error("Failed to resolve membership");

  const [access] = await input.db
    .select()
    .from(userTenantAccess)
    .where(and(eq(userTenantAccess.tenantId, input.tenantId), eq(userTenantAccess.userId, user.id)))
    .limit(1);
  if (!access) {
    await input.db.insert(userTenantAccess).values({
      id: createId(),
      tenantId: input.tenantId,
      userId: user.id,
      status: "ACTIVE",
      isDefaultTenant: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [roleAssign] = await input.db
    .select()
    .from(userRoleAssignments)
    .where(
      and(
        eq(userRoleAssignments.tenantId, input.tenantId),
        eq(userRoleAssignments.userId, user.id),
        eq(userRoleAssignments.roleId, input.roleId),
      ),
    )
    .limit(1);
  if (!roleAssign) {
    await input.db.insert(userRoleAssignments).values({
      id: createId(),
      tenantId: input.tenantId,
      userId: user.id,
      roleId: input.roleId,
      grantedByUserId: user.id,
      reason: "PROD-S1C Forge Internal Test UAT",
      createdAt: now,
    });
  }

  const [membershipRole] = await input.db
    .select()
    .from(membershipRoleAssignments)
    .where(
      and(
        eq(membershipRoleAssignments.membershipId, membership.id),
        eq(membershipRoleAssignments.roleId, input.roleId),
      ),
    )
    .limit(1);
  if (!membershipRole) {
    await input.db.insert(membershipRoleAssignments).values({
      id: createId(),
      tenantId: input.tenantId,
      membershipId: membership.id,
      roleId: input.roleId,
      status: "ACTIVE",
      grantedByUserId: user.id,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { userId: user.id, membershipId: membership.id };
}

async function onboardTenant(
  onboarding: OnboardingService,
  principal: ForgePrincipal,
  input: {
    customerType: "INDUSTRIAL";
    tenantKey: string;
    slug: string;
    legalName: string;
    displayName: string;
    orgSlug: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
    omitModule?: string;
  },
): Promise<{ tenantId: string; sessionId: string }> {
  const started = await onboarding.start(
    {
      customerType: input.customerType,
      tenantKey: input.tenantKey,
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
    },
    principal,
  );
  let recordVersion = started.session.recordVersion;
  const tenantId = started.session.tenantId;
  const sessionId = started.session.id;
  const complete = async (stepKey: string, payload: Record<string, unknown>) => {
    const result = await onboarding.completeStep(
      sessionId,
      stepKey,
      payload,
      principal,
      recordVersion,
      tenantId,
    );
    recordVersion = result.session.recordVersion;
    return result;
  };

  await complete("CREATE_PRIMARY_ORGANIZATION", {
    slug: input.orgSlug,
    legalName: input.legalName,
    displayName: input.displayName,
    organizationTypeCode: "SAFETY_COMPANY",
  });
  await complete("SELECT_PRODUCTS", { productCodes: ["FORGE_INDUSTRIAL"] });
  const modules = [
    "CORE",
    "PERSONNEL",
    "TRAINING",
    "INCIDENTS",
    "INSPECTIONS",
    "JSAS",
    "FORMS",
    "REPORTING",
  ];
  await complete("SELECT_MODULES", {
    moduleCodes: input.omitModule ? modules.filter((code) => code !== input.omitModule) : modules,
  });
  await complete("CONFIGURE_SUBSCRIPTION", { waiveSubscription: true });
  // Steps 7–12; empty payloads accept the onboarding defaults.
  await complete("CONFIGURE_LOCATIONS", {});
  await complete("CONFIGURE_ORG_LOOKUPS", {});
  await complete("CONFIGURE_DATA_IMPORT", {});
  await complete("CONFIGURE_DOCUMENTS", {});
  await complete("CONFIGURE_BRANDING", { emailSenderName: input.displayName });
  await complete("CONFIGURE_BUSINESS_SETTINGS", {});
  await complete("CREATE_PRIMARY_ADMINISTRATOR", {
    email: input.adminEmail,
    firstName: input.adminFirstName,
    lastName: input.adminLastName,
    roleCode: "INDUSTRIAL_TENANT_ADMIN",
  });
  await complete("SEND_INVITATION", { send: false, expiresInHours: 168 });
  await complete("REVIEW_CONFIGURATION", { acknowledged: true });
  await onboarding.activate(sessionId, principal, recordVersion, tenantId);
  return { tenantId, sessionId };
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_PRODUCTION !== "YES") {
    throw new Error("Refusing production UAT provision without CONFIRM_PRODUCTION=YES");
  }

  const creatorSub = requireEnv("UAT_CREATOR_SUB");
  const creatorEmail = requireEnv("UAT_CREATOR_EMAIL");
  const ownerASub = requireEnv("UAT_A_OWNER_SUB");
  const ownerAEmail = requireEnv("UAT_A_OWNER_EMAIL");
  const adminASub = requireEnv("UAT_A_ADMIN_SUB");
  const adminAEmail = requireEnv("UAT_A_ADMIN_EMAIL");
  const viewerASub = requireEnv("UAT_A_VIEWER_SUB");
  const viewerAEmail = requireEnv("UAT_A_VIEWER_EMAIL");
  const ownerBSub = requireEnv("UAT_B_OWNER_SUB");
  const ownerBEmail = requireEnv("UAT_B_OWNER_EMAIL");

  process.env.BOOTSTRAP_COGNITO_SUB = creatorSub;
  process.env.BOOTSTRAP_EMAIL = creatorEmail;
  process.env.BOOTSTRAP_FIRST_NAME = "Forge";
  process.env.BOOTSTRAP_LAST_NAME = "UAT Creator";

  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const app = await NestFactory.createApplicationContext(AppModule.register(env), {
    logger: false,
  });
  try {
    const db = app.get<Database>(DATABASE);
    await seedPlatformData(db as Parameters<typeof seedPlatformData>[0]);
    const { runBootstrapAdmin } = await import("@forge/database/bootstrap-admin-ecs");
    await runBootstrapAdmin();
    const onboarding = app.get(OnboardingService);
    const principal = await resolvePlatformPrincipal(db);

    const existingA = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantKey, "forge-uat-industrial-a"))
      .limit(1);
    const tenantA =
      existingA[0]?.id ??
      (
        await onboardTenant(onboarding, principal, {
          customerType: "INDUSTRIAL",
          tenantKey: "forge-uat-industrial-a",
          slug: "forge-uat-industrial-a",
          legalName: "FORGE INTERNAL TEST Industrial UAT",
          displayName: "FORGE INTERNAL TEST Industrial",
          orgSlug: "forge-uat-industrial-a-org",
          adminEmail: ownerAEmail,
          adminFirstName: "UAT",
          adminLastName: "OwnerA",
          omitModule: "LOCKOUT_TAGOUT",
        })
      ).tenantId;

    // Tenant B is the cross-tenant isolation peer. Reuse the legacy RMS UAT tenant where it
    // already exists; RMS onboarding is gone, so new environments get a second Industrial tenant.
    const existingB = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(inArray(tenants.tenantKey, ["forge-uat-industrial-b", "forge-uat-rms-b"]))
      .limit(1);
    const tenantB =
      existingB[0]?.id ??
      (
        await onboardTenant(onboarding, principal, {
          customerType: "INDUSTRIAL",
          tenantKey: "forge-uat-industrial-b",
          slug: "forge-uat-industrial-b",
          legalName: "FORGE INTERNAL TEST Industrial UAT B",
          displayName: "FORGE INTERNAL TEST Industrial B",
          orgSlug: "forge-uat-industrial-b-org",
          adminEmail: ownerBEmail,
          adminFirstName: "UAT",
          adminLastName: "OwnerB",
        })
      ).tenantId;

    const ownerRoleA = await ensureRoleFromTemplate(db, tenantA, "TENANT_OWNER");
    const adminRoleA = await ensureRoleFromTemplate(db, tenantA, "TENANT_ADMIN");
    const viewerRoleA = await ensureRoleFromTemplate(db, tenantA, "READ_ONLY_USER");
    const ownerRoleB = await ensureRoleFromTemplate(db, tenantB, "TENANT_OWNER");

    const ownerA = await linkCognitoUser({
      db,
      tenantId: tenantA,
      email: ownerAEmail,
      firstName: "UAT",
      lastName: "OwnerA",
      cognitoSub: ownerASub,
      roleId: ownerRoleA,
    });
    const adminA = await linkCognitoUser({
      db,
      tenantId: tenantA,
      email: adminAEmail,
      firstName: "UAT",
      lastName: "AdminA",
      cognitoSub: adminASub,
      roleId: adminRoleA,
    });
    const viewerA = await linkCognitoUser({
      db,
      tenantId: tenantA,
      email: viewerAEmail,
      firstName: "UAT",
      lastName: "ViewerA",
      cognitoSub: viewerASub,
      roleId: viewerRoleA,
    });
    const ownerB = await linkCognitoUser({
      db,
      tenantId: tenantB,
      email: ownerBEmail,
      firstName: "UAT",
      lastName: "OwnerB",
      cognitoSub: ownerBSub,
      roleId: ownerRoleB,
    });

    // eslint-disable-next-line no-console -- CLI provisioning script reports its result on stdout
    console.info(
      JSON.stringify({
        status: "provisioned",
        tenantAId: tenantA,
        tenantBId: tenantB,
        ownerAUserId: ownerA.userId,
        adminAUserId: adminA.userId,
        viewerAUserId: viewerA.userId,
        ownerBUserId: ownerB.userId,
        creatorEmailFingerprint: fingerprint(creatorEmail),
        ownerAEmailFingerprint: fingerprint(ownerAEmail),
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
