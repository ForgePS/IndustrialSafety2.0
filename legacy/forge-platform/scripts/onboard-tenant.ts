#!/usr/bin/env node
/**
 * Drive the customer onboarding flow for a synthetic tenant (Sprint 1E Wave 5).
 *
 * Usage:
 *   pnpm platform:onboard-tenant \
 *     --customer-type INDUSTRIAL \
 *     --tenant-key "acme-industrial" \
 *     --slug "acme-industrial" \
 *     --legal-name "Acme Industrial LLC" \
 *     --display-name "Acme Industrial" \
 *     --org-slug "acme" \
 *     --org-legal-name "Acme Industrial LLC" \
 *     --org-display-name "Acme Industrial" \
 *     --admin-email "admin@example.com" \
 *     --admin-first-name "Alex" \
 *     --admin-last-name "Admin"
 *
 * Optional: --template-code, --activate (default true), --waive-subscription (default true)
 */
import "reflect-metadata";
import { createHash, randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  CUSTOMER_TYPES,
  findStarterTemplate,
  findStarterTemplateForCustomerType,
  type CustomerType,
} from "@forge/contracts";
import { createId, tenants, users } from "@forge/database";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { AppModule } from "../apps/platform-api/src/app.module.js";
import { OnboardingService } from "../apps/platform-api/src/modules/onboarding/onboarding.service.js";
import { DATABASE } from "../apps/platform-api/src/tokens.js";
import type { Database } from "@forge/database";

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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function resolvePlatformPrincipal(db: Database): Promise<ForgePrincipal> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.tenantKey, "forge-platform"))
    .limit(1);
  if (!tenant) {
    throw new Error("Platform tenant missing. Run db:seed and platform:bootstrap-admin first.");
  }

  const platformUsers = await db
    .select({ id: users.id, personId: users.personId, email: users.primaryEmail })
    .from(users)
    .where(eq(users.tenantId, tenant.id));

  let actor = platformUsers[0];
  if (!actor) {
    throw new Error("No platform user found. Run platform:bootstrap-admin first.");
  }

  const correlationId = createId();
  return {
    authenticationIdentityId: `script:onboard-tenant:${correlationId}`,
    userId: actor.id,
    personId: actor.personId,
    tenantId: tenant.id,
    organizationIds: [],
    permissions: new Set(["platform.onboarding.manage"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId,
    requestId: createId(),
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

async function main(): Promise<void> {
  const customerTypeRaw = requireArg("customer-type").toUpperCase();
  if (!(CUSTOMER_TYPES as readonly string[]).includes(customerTypeRaw)) {
    console.error(`Invalid --customer-type. Expected one of: ${CUSTOMER_TYPES.join(", ")}`);
    process.exit(1);
  }
  const customerType = customerTypeRaw as CustomerType;

  const tenantKey = requireArg("tenant-key");
  const slug = requireArg("slug");
  const legalName = requireArg("legal-name");
  const displayName = requireArg("display-name");
  const orgSlug = requireArg("org-slug");
  const orgLegalName = requireArg("org-legal-name");
  const orgDisplayName = requireArg("org-display-name");
  const adminEmail = requireArg("admin-email").toLowerCase();
  const adminFirstName = requireArg("admin-first-name");
  const adminLastName = requireArg("admin-last-name");

  const templateCode = arg("template-code");
  const activate = !hasFlag("no-activate");
  const waiveSubscription = !hasFlag("require-subscription");

  const template =
    (templateCode ? findStarterTemplate(templateCode) : undefined) ??
    findStarterTemplateForCustomerType(customerType);
  if (customerType !== "OTHER" && !template) {
    throw new Error(`No starter template for customer type ${customerType}`);
  }

  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  if (env.APP_ENV === "production" && !hasFlag("confirm-production")) {
    console.error("Refusing to onboard in production without --confirm-production");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule.register(env), {
    logger: false,
  });

  try {
    const db = app.get<Database>(DATABASE);
    const onboarding = app.get(OnboardingService);
    const principal = await resolvePlatformPrincipal(db);

    const started = await onboarding.start(
      {
        customerType,
        templateCode,
        tenantKey,
        slug,
        legalName,
        displayName,
      },
      principal,
    );

    const { session } = started;
    let recordVersion = session.recordVersion;
    const tenantId = session.tenantId;
    const sessionId = session.id;

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
      slug: orgSlug,
      legalName: orgLegalName,
      displayName: orgDisplayName,
      organizationTypeCode: template?.organizationTypeCode,
    });

    await complete("SELECT_PRODUCTS", {
      productCodes: template ? [template.productCode] : [],
    });

    await complete("SELECT_MODULES", {
      moduleCodes: template?.modules.map((mod) => mod.code) ?? ["CORE"],
    });

    await complete(
      "CONFIGURE_SUBSCRIPTION",
      waiveSubscription
        ? { waiveSubscription: true }
        : { planCode: arg("plan-code") ?? "CUSTOMER_STARTER", status: "TRIAL" },
    );

    await complete("CONFIGURE_BRANDING", {
      emailSenderName: displayName,
    });

    await complete("CREATE_PRIMARY_ADMINISTRATOR", {
      email: adminEmail,
      firstName: adminFirstName,
      lastName: adminLastName,
      roleCode: template?.roles.find((role) => role.code.includes("ADMIN"))?.code,
    });

    await complete("SEND_INVITATION", {
      send: false,
      expiresInHours: 168,
    });

    await complete("REVIEW_CONFIGURATION", {
      acknowledged: true,
    });

    let activatedTenant = null;
    if (activate) {
      const activation = await onboarding.activate(sessionId, principal, recordVersion, tenantId);
      recordVersion = activation.session.recordVersion;
      activatedTenant = activation.tenant;
    }

    const finalView = await onboarding.getSession(sessionId, tenantId);
    const emailFingerprint = createHash("sha256").update(adminEmail).digest("hex").slice(0, 12);
    const suffix = randomBytes(2).toString("hex");

    console.log(
      JSON.stringify(
        {
          ok: true,
          sessionId,
          tenantId,
          customerType,
          templateCode: template?.code ?? templateCode ?? null,
          currentStep: finalView.session.currentStep,
          sessionStatus: finalView.session.status,
          completedSteps: finalView.steps.filter((step) => step.status === "COMPLETED").length,
          tenantStatus: activatedTenant?.status ?? "PROVISIONING",
          adminEmailFingerprint: emailFingerprint,
          traceSuffix: suffix,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
