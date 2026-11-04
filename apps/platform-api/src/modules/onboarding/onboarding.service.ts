import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  customerOnboardingSessions,
  customerOnboardingSteps,
  facilities,
  industrialDepartments,
  industrialEmploymentTypes,
  industrialPositions,
  organizations,
  permissions,
  rolePermissions,
  roleTemplatePermissions,
  roleTemplates,
  roles,
  subscriptions,
  tenantBranding,
  tenantProducts,
  tenantSettings,
  userInvitations,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { BrandingService } from "../branding/branding.service.js";
import { ConfigurationService } from "../configuration/configuration.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { OrganizationsService } from "../organizations/organizations.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { SubscriptionsService } from "../subscriptions/subscriptions.service.js";
import { TenantsService, type ExpectedVersion } from "../tenants/tenants.service.js";
import { resolveModuleProducts } from "./onboarding-module-products.js";
import {
  DEFAULT_ONBOARDING_FACILITY,
  ONBOARDING_STEPS,
  STARTER_TEMPLATES,
  completeOnboardingStepInputSchema,
  findStarterTemplate,
  findStarterTemplateForCustomerType,
  resolveOnboardingSteps,
  startOnboardingInputSchema,
  type OnboardingStepKey,
  type StarterTemplate,
} from "@forge/contracts";

type StepStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "FAILED";

interface OnboardingSessionData {
  templateCode?: string;
  primaryOrganizationId?: string;
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminRoleCode?: string;
  invitationId?: string;
  subscriptionWaived?: boolean;
  subscriptionId?: string;
  productCodes?: string[];
  moduleCodes?: string[];
  securityConfigured?: boolean;
  brandingConfigured?: boolean;
  reviewed?: boolean;
  locationIds?: string[];
  departments?: Array<{ name: string; description?: string | undefined }>;
  positions?: Array<{
    name: string;
    description?: string | undefined;
    departmentName?: string | undefined;
  }>;
  employmentTypes?: Array<{ name: string; description?: string | undefined }>;
  importJobsCompleted?: string[];
  personnelImported?: boolean;
  fleetImported?: boolean;
  documentsConfigured?: { documentIds?: string[]; count?: number };
  businessSettingsConfigured?: boolean;
}

export interface ActivationError {
  code: string;
  message: string;
}

export interface OnboardingSessionView {
  session: typeof customerOnboardingSessions.$inferSelect;
  steps: (typeof customerOnboardingSteps.$inferSelect)[];
  template: StarterTemplate | null;
}

const organizationStepSchema = z.object({
  organizationTypeCode: z.string().min(1).max(64).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  legalName: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  timezone: z.string().max(64).optional(),
});

const productsStepSchema = z.object({
  productCodes: z.array(z.string().min(1).max(64)).min(1).max(10).optional(),
});

const modulesStepSchema = z.object({
  moduleCodes: z.array(z.string().min(1).max(64)).min(1).max(50).optional(),
});

const subscriptionStepSchema = z.object({
  planCode: z.string().min(1).max(64).optional(),
  waiveSubscription: z.boolean().optional(),
  status: z.enum(["TRIAL", "ACTIVE", "GRACE"]).default("TRIAL"),
  periodDays: z.number().int().positive().default(30),
});

const locationsStepSchema = z.object({
  locations: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        facilityType: z.string().min(1).max(64).optional().default("SITE"),
        addressLine1: z.string().max(300).optional(),
        city: z.string().max(120).optional(),
        stateProvince: z.string().max(120).optional(),
        postalCode: z.string().max(32).optional(),
        countryCode: z.string().length(2).optional(),
        timezone: z.string().max(64).optional(),
      }),
    )
    .max(50)
    .default([]),
});

const orgLookupsStepSchema = z.object({
  departments: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        description: z.string().max(1000).optional(),
      }),
    )
    .max(100)
    .default([]),
  positions: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        departmentName: z.string().min(1).max(300).optional(),
      }),
    )
    .max(100)
    .default([]),
  employmentTypes: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
      }),
    )
    .max(50)
    .default([]),
});

const dataImportStepSchema = z.object({
  importJobsCompleted: z.array(z.string().min(1).max(128)).max(50).optional(),
  personnelImported: z.boolean().optional(),
  fleetImported: z.boolean().optional(),
});

const documentsStepSchema = z.object({
  documentIds: z.array(z.string().uuid()).max(100).optional(),
  count: z.number().int().nonnegative().optional(),
});

const businessSettingsStepSchema = z.object({
  timezone: z.string().max(64).optional(),
  dateFormat: z.string().max(64).optional(),
  employeeIdFormat: z.string().max(120).optional(),
  emailNotifications: z.boolean().optional(),
  mobileAccess: z.boolean().optional(),
  employeePortal: z.boolean().optional(),
  incidentNumbering: z.string().max(120).optional(),
  inspectionNumbering: z.string().max(120).optional(),
  fleetNumbering: z.string().max(120).optional(),
});

const brandingStepSchema = z.object({
  logoDocumentId: z.string().uuid().optional().nullable(),
  iconDocumentId: z.string().uuid().optional().nullable(),
  primaryColor: z.string().max(32).optional().nullable(),
  secondaryColor: z.string().max(32).optional().nullable(),
  accentColor: z.string().max(32).optional().nullable(),
  emailSenderName: z.string().max(200).optional().nullable(),
  supportEmail: z.string().email().max(320).optional().nullable(),
  customCssEnabled: z.boolean().optional(),
});

const administratorStepSchema = z.object({
  email: z.string().email().max(320),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleCode: z.string().min(1).max(64).optional(),
});

const invitationStepSchema = z.object({
  send: z.boolean().default(false),
  expiresInHours: z.number().int().min(1).max(720).default(168),
});

const reviewStepSchema = z.object({
  acknowledged: z.boolean().default(true),
  security: z
    .object({
      mfaRequired: z.boolean().default(false),
      sessionTimeoutMinutes: z.number().int().min(15).max(1440).default(480),
      passwordPolicy: z.enum(["STANDARD", "STRICT"]).default("STANDARD"),
    })
    .optional(),
});

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenants: TenantsService,
    private readonly organizations: OrganizationsService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly branding: BrandingService,
    private readonly configuration: ConfigurationService,
    private readonly invitations: InvitationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async start(input: unknown, principal: ForgePrincipal): Promise<OnboardingSessionView> {
    const data = startOnboardingInputSchema.parse(input);
    const template =
      (data.templateCode ? findStarterTemplate(data.templateCode) : undefined) ??
      findStarterTemplateForCustomerType(data.customerType);

    if (data.templateCode && !template) {
      throw new ForgeError("BAD_REQUEST", "Unknown starter template code");
    }
    if (data.customerType !== "OTHER" && !template) {
      throw new ForgeError("BAD_REQUEST", "No starter template for customer type");
    }

    const tenant = await this.tenants.create(
      {
        tenantKey: data.tenantKey,
        slug: data.slug,
        legalName: data.legalName,
        displayName: data.displayName,
        timezone: data.timezone,
        tenantType: "CUSTOMER",
      },
      principal,
    );

    const sessionId = createId();
    const now = new Date();
    const sessionData: OnboardingSessionData = {
      ...(template?.code ? { templateCode: template.code } : {}),
      ...(data.templateCode ? { templateCode: data.templateCode } : {}),
      productCodes: template ? [template.productCode] : [],
      moduleCodes: template?.modules.map((mod) => mod.code) ?? [],
    };
    const resolvedSteps = resolveOnboardingSteps(template?.onboarding ?? null, [
      ...ONBOARDING_STEPS,
    ]);
    const firstOpenStep =
      resolvedSteps.find(
        (step) => step.key !== "CREATE_TENANT" && step.key !== "SELECT_CUSTOMER_TYPE",
      )?.number ?? resolvedSteps.length;

    await withTenantTransaction(
      this.db,
      tenant.id,
      async (tx) => {
        const existing = await tx.query.customerOnboardingSessions.findFirst({
          where: eq(customerOnboardingSessions.tenantId, tenant.id),
        });
        if (existing) {
          throw new ForgeError("CONFLICT", "An onboarding session already exists for this tenant");
        }

        await tx.insert(customerOnboardingSessions).values({
          id: sessionId,
          tenantId: tenant.id,
          customerType: data.customerType,
          templateCode: template?.code ?? data.templateCode ?? null,
          status: "IN_PROGRESS",
          currentStep: firstOpenStep,
          sessionDataJson: sessionData,
          activationErrorsJson: [],
          startedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        for (const step of resolvedSteps) {
          const autoComplete = step.key === "CREATE_TENANT" || step.key === "SELECT_CUSTOMER_TYPE";
          const status: StepStatus = autoComplete ? "COMPLETED" : "PENDING";
          await tx.insert(customerOnboardingSteps).values({
            id: createId(),
            tenantId: tenant.id,
            sessionId,
            stepNumber: step.number,
            stepKey: step.key,
            status,
            payloadJson:
              step.key === "CREATE_TENANT"
                ? { tenantId: tenant.id }
                : step.key === "SELECT_CUSTOMER_TYPE"
                  ? { customerType: data.customerType, templateCode: template?.code ?? null }
                  : {},
            validationErrorsJson: [],
            completedByUserId: status === "COMPLETED" ? principal.userId : null,
            completedAt: status === "COMPLETED" ? now : null,
            createdAt: now,
            updatedAt: now,
          });
        }

        await this.audit.writeInTransaction(tx, {
          tenantId: tenant.id,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "onboarding.start",
          resourceType: "customer_onboarding_session",
          resourceId: sessionId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: {
            sessionId,
            customerType: data.customerType,
            templateCode: template?.code ?? null,
            tenantId: tenant.id,
          },
        });
      },
      principal.userId,
    );

    return this.getSession(sessionId, tenant.id);
  }

  async listSessions(): Promise<OnboardingSessionView[]> {
    const tenantRows = await this.tenants.list();
    const views: OnboardingSessionView[] = [];
    for (const tenant of tenantRows) {
      const view = await withTenantTransaction(this.db, tenant.id, async (tx) => {
        const session = await tx.query.customerOnboardingSessions.findFirst({
          where: eq(customerOnboardingSessions.tenantId, tenant.id),
        });
        if (!session) {
          return null;
        }
        const steps = await tx.query.customerOnboardingSteps.findMany({
          where: eq(customerOnboardingSteps.sessionId, session.id),
          orderBy: [asc(customerOnboardingSteps.stepNumber)],
        });
        return this.toView(session, steps);
      });
      if (view) {
        views.push(view);
      }
    }
    return views;
  }

  async getSession(sessionId: string, tenantIdHint?: string): Promise<OnboardingSessionView> {
    const resolved = await this.resolveSession(sessionId, tenantIdHint);
    return this.toView(resolved.session, resolved.steps);
  }

  async completeStep(
    sessionId: string,
    stepKey: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    tenantIdHint?: string,
  ): Promise<OnboardingSessionView> {
    const parsed = completeOnboardingStepInputSchema.parse({ stepKey, payload: input });
    this.assertKnownStep(parsed.stepKey);

    if (parsed.stepKey === "CREATE_TENANT" || parsed.stepKey === "SELECT_CUSTOMER_TYPE") {
      return this.getSession(sessionId, tenantIdHint);
    }
    if (parsed.stepKey === "ACTIVATE_TENANT") {
      throw new ForgeError("BAD_REQUEST", "Use POST .../activate to activate the tenant");
    }

    const resolved = await this.resolveSession(sessionId, tenantIdHint);
    const { session, steps } = resolved;
    const tenantId = session.tenantId;
    const template = this.resolveTemplate(session);
    const sessionData = this.readSessionData(session);

    this.assertStepUnlocked(steps, parsed.stepKey);

    const validationErrors: ActivationError[] = [];
    const nextSessionData = { ...sessionData };
    let stepPayload: Record<string, unknown> = parsed.payload;

    try {
      switch (parsed.stepKey as OnboardingStepKey) {
        case "CREATE_PRIMARY_ORGANIZATION": {
          const orgInput = organizationStepSchema.parse(parsed.payload);
          const organizationTypeCode =
            orgInput.organizationTypeCode ?? template?.organizationTypeCode;
          if (!organizationTypeCode) {
            throw new ForgeError(
              "BAD_REQUEST",
              "organizationTypeCode is required when no starter template applies",
            );
          }
          const organization = await this.organizations.create(
            tenantId,
            {
              ...orgInput,
              organizationTypeCode,
            },
            principal,
          );
          nextSessionData.primaryOrganizationId = organization.id;
          stepPayload = { organizationId: organization.id, ...orgInput };
          break;
        }
        case "SELECT_PRODUCTS": {
          const productInput = productsStepSchema.parse(parsed.payload);
          const productCodes = productInput.productCodes ?? sessionData.productCodes ?? [];
          if (productCodes.length === 0) {
            throw new ForgeError("BAD_REQUEST", "At least one product must be selected");
          }
          if (template) {
            await this.ensureStarterRoles(tenantId, template, principal);
          }
          for (const productCode of productCodes) {
            await this.entitlements.putProduct(
              tenantId,
              productCode,
              { status: "ACTIVE" },
              principal,
            );
          }
          nextSessionData.productCodes = productCodes;
          stepPayload = { productCodes };
          break;
        }
        case "SELECT_MODULES": {
          const moduleInput = modulesStepSchema.parse(parsed.payload);
          const moduleCodes =
            moduleInput.moduleCodes ??
            sessionData.moduleCodes ??
            template?.modules.map((mod) => mod.code) ??
            [];
          if (moduleCodes.length === 0) {
            throw new ForgeError("BAD_REQUEST", "At least one module must be selected");
          }
          const selectedProducts =
            sessionData.productCodes ?? (template ? [template.productCode] : []);
          for (const { moduleCode, productCode } of resolveModuleProducts(
            moduleCodes,
            selectedProducts,
          )) {
            const isCore =
              template?.modules.find((mod) => mod.code === moduleCode)?.isCore ?? false;
            await this.entitlements.putModule(
              tenantId,
              moduleCode,
              {
                status: "ACTIVE",
                sourceType: isCore ? "TEMPLATE_CORE" : "TEMPLATE",
                ...(productCode ? { productCode } : {}),
              },
              principal,
            );
          }
          nextSessionData.moduleCodes = moduleCodes;
          stepPayload = { moduleCodes };
          break;
        }
        case "CONFIGURE_SUBSCRIPTION": {
          const subInput = subscriptionStepSchema.parse(parsed.payload);
          if (subInput.waiveSubscription) {
            nextSessionData.subscriptionWaived = true;
            stepPayload = { subscriptionWaived: true };
          } else {
            if (!subInput.planCode) {
              throw new ForgeError(
                "BAD_REQUEST",
                "planCode is required unless waiveSubscription is true",
              );
            }
            const subscription = await this.subscriptions.create(
              tenantId,
              {
                planCode: subInput.planCode,
                status: subInput.status,
                periodDays: subInput.periodDays,
              },
              principal,
            );
            nextSessionData.subscriptionId = subscription.id;
            nextSessionData.subscriptionWaived = false;
            stepPayload = {
              subscriptionId: subscription.id,
              planCode: subInput.planCode,
              status: subInput.status,
            };
          }
          break;
        }
        case "CONFIGURE_LOCATIONS": {
          const locInput = locationsStepSchema.parse(parsed.payload);
          const createdIds: string[] = [...(sessionData.locationIds ?? [])];
          for (const [index, location] of locInput.locations.entries()) {
            const facilityKey = `loc-${index + 1}-${location.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 40)}`;
            const facility = await withTenantTransaction(
              this.db,
              tenantId,
              async (tx) => {
                const existing = await tx.query.facilities.findFirst({
                  where: and(
                    eq(facilities.tenantId, tenantId),
                    eq(facilities.facilityKey, facilityKey),
                  ),
                });
                if (existing) {
                  return existing;
                }
                const now = new Date();
                const id = createId();
                const [row] = await tx
                  .insert(facilities)
                  .values({
                    id,
                    tenantId,
                    organizationId: nextSessionData.primaryOrganizationId ?? null,
                    facilityKey,
                    name: location.name,
                    facilityType: location.facilityType ?? "SITE",
                    status: "ACTIVE",
                    addressLine1: location.addressLine1,
                    city: location.city,
                    stateProvince: location.stateProvince,
                    postalCode: location.postalCode,
                    countryCode: location.countryCode ?? "US",
                    timezone: location.timezone,
                    createdAt: now,
                    updatedAt: now,
                    createdByUserId: principal.userId,
                    updatedByUserId: principal.userId,
                  })
                  .returning();
                if (!row) {
                  throw new ForgeError("BAD_REQUEST", "Failed to create location");
                }
                await this.audit.writeInTransaction(tx, {
                  tenantId,
                  actorUserId: principal.userId,
                  actorPersonId: principal.personId,
                  actorType: "USER",
                  action: "facility.create",
                  resourceType: "facility",
                  resourceId: row.id,
                  result: "SUCCESS",
                  riskLevel: "LOW",
                  correlationId: principal.correlationId,
                  requestId: principal.requestId,
                  after: { name: row.name, source: "onboarding" },
                });
                return row;
              },
              principal.userId,
            );
            if (!createdIds.includes(facility.id)) {
              createdIds.push(facility.id);
            }
          }
          nextSessionData.locationIds = createdIds;
          stepPayload = { locationIds: createdIds, count: createdIds.length };
          break;
        }
        case "CONFIGURE_ORG_LOOKUPS": {
          const lookupInput = orgLookupsStepSchema.parse(parsed.payload);
          nextSessionData.departments = lookupInput.departments;
          nextSessionData.positions = lookupInput.positions;
          nextSessionData.employmentTypes = lookupInput.employmentTypes;
          // Persist industrial org lookups when Industrial Safety is entitled.
          if ((nextSessionData.productCodes ?? []).includes("FORGE_INDUSTRIAL")) {
            const hasLookups =
              lookupInput.departments.length > 0 ||
              lookupInput.positions.length > 0 ||
              lookupInput.employmentTypes.length > 0;
            if (hasLookups) {
              await withTenantTransaction(
                this.db,
                tenantId,
                async (tx) => {
                  const departmentIdsByName = new Map<string, string>();
                  for (const dept of lookupInput.departments) {
                    const existing = await tx
                      .select()
                      .from(industrialDepartments)
                      .where(
                        and(
                          eq(industrialDepartments.tenantId, tenantId),
                          eq(industrialDepartments.name, dept.name),
                        ),
                      )
                      .limit(1);
                    if (existing[0]) {
                      departmentIdsByName.set(dept.name.toLowerCase(), existing[0].id);
                      continue;
                    }
                    const now = new Date();
                    const id = createId();
                    await tx.insert(industrialDepartments).values({
                      id,
                      tenantId,
                      name: dept.name,
                      status: "ACTIVE",
                      sourceSystem: "FORGE",
                      sourcePayload: {
                        description: dept.description ?? null,
                        source: "onboarding",
                      },
                      createdAt: now,
                      updatedAt: now,
                    });
                    departmentIdsByName.set(dept.name.toLowerCase(), id);
                  }

                  for (const position of lookupInput.positions) {
                    const existing = await tx
                      .select()
                      .from(industrialPositions)
                      .where(
                        and(
                          eq(industrialPositions.tenantId, tenantId),
                          eq(industrialPositions.name, position.name),
                        ),
                      )
                      .limit(1);
                    if (existing[0]) continue;
                    let departmentId: string | undefined;
                    if (position.departmentName) {
                      departmentId = departmentIdsByName.get(position.departmentName.toLowerCase());
                      if (!departmentId) {
                        const deptRows = await tx
                          .select()
                          .from(industrialDepartments)
                          .where(
                            and(
                              eq(industrialDepartments.tenantId, tenantId),
                              eq(industrialDepartments.name, position.departmentName),
                            ),
                          )
                          .limit(1);
                        departmentId = deptRows[0]?.id;
                      }
                    }
                    const now = new Date();
                    await tx.insert(industrialPositions).values({
                      id: createId(),
                      tenantId,
                      name: position.name,
                      description: position.description,
                      departmentId,
                      status: "ACTIVE",
                      sourceSystem: "FORGE",
                      sourcePayload: {
                        description: position.description ?? null,
                        departmentName: position.departmentName ?? null,
                        source: "onboarding",
                      },
                      createdAt: now,
                      updatedAt: now,
                    });
                  }

                  for (const empType of lookupInput.employmentTypes) {
                    const existing = await tx
                      .select()
                      .from(industrialEmploymentTypes)
                      .where(
                        and(
                          eq(industrialEmploymentTypes.tenantId, tenantId),
                          eq(industrialEmploymentTypes.name, empType.name),
                        ),
                      )
                      .limit(1);
                    if (existing[0]) continue;
                    const now = new Date();
                    await tx.insert(industrialEmploymentTypes).values({
                      id: createId(),
                      tenantId,
                      name: empType.name,
                      description: empType.description,
                      status: "ACTIVE",
                      sourceSystem: "FORGE",
                      sourcePayload: {
                        description: empType.description ?? null,
                        source: "onboarding",
                      },
                      createdAt: now,
                      updatedAt: now,
                    });
                  }

                  await this.audit.writeInTransaction(tx, {
                    tenantId,
                    actorUserId: principal.userId,
                    actorPersonId: principal.personId,
                    actorType: "USER",
                    action: "onboarding.org_lookups",
                    resourceType: "customer_onboarding_session",
                    resourceId: sessionId,
                    result: "SUCCESS",
                    riskLevel: "LOW",
                    correlationId: principal.correlationId,
                    requestId: principal.requestId,
                    after: {
                      departments: lookupInput.departments.length,
                      positions: lookupInput.positions.length,
                      employmentTypes: lookupInput.employmentTypes.length,
                    },
                  });
                },
                principal.userId,
              );
            }
          }
          stepPayload = {
            departments: lookupInput.departments,
            positions: lookupInput.positions,
            employmentTypes: lookupInput.employmentTypes,
          };
          break;
        }
        case "CONFIGURE_DATA_IMPORT": {
          const importInput = dataImportStepSchema.parse(parsed.payload);
          if (importInput.importJobsCompleted !== undefined) {
            nextSessionData.importJobsCompleted = importInput.importJobsCompleted;
          }
          if (importInput.personnelImported !== undefined) {
            nextSessionData.personnelImported = importInput.personnelImported;
          }
          if (importInput.fleetImported !== undefined) {
            nextSessionData.fleetImported = importInput.fleetImported;
          }
          stepPayload = { ...importInput };
          break;
        }
        case "CONFIGURE_DOCUMENTS": {
          const docsInput = documentsStepSchema.parse(parsed.payload);
          const documentsConfigured: {
            documentIds?: string[];
            count?: number;
          } = {
            count: docsInput.count ?? docsInput.documentIds?.length ?? 0,
          };
          if (docsInput.documentIds !== undefined) {
            documentsConfigured.documentIds = docsInput.documentIds;
          }
          nextSessionData.documentsConfigured = documentsConfigured;
          stepPayload = { ...documentsConfigured };
          break;
        }
        case "CONFIGURE_BRANDING": {
          const brandingInput = brandingStepSchema.parse(parsed.payload);
          const tenant = await this.tenants.getById(tenantId);
          await this.branding.put(
            tenantId,
            {
              emailSenderName: brandingInput.emailSenderName ?? tenant.displayName,
              supportEmail: brandingInput.supportEmail ?? undefined,
              primaryColor: brandingInput.primaryColor ?? "#1a365d",
              secondaryColor: brandingInput.secondaryColor ?? "#2d3748",
              accentColor: brandingInput.accentColor ?? "#3182ce",
              logoDocumentId: brandingInput.logoDocumentId,
              iconDocumentId: brandingInput.iconDocumentId,
              customCssEnabled: brandingInput.customCssEnabled ?? false,
            },
            principal,
          );
          nextSessionData.brandingConfigured = true;
          stepPayload = { ...brandingInput, appliedDefaults: true };
          break;
        }
        case "CONFIGURE_BUSINESS_SETTINGS": {
          const businessInput = businessSettingsStepSchema.parse(parsed.payload);
          await this.configuration.put(
            tenantId,
            "business",
            "defaults",
            { value: businessInput },
            principal,
          );
          nextSessionData.businessSettingsConfigured = true;
          stepPayload = { ...businessInput };
          break;
        }
        case "CREATE_PRIMARY_ADMINISTRATOR": {
          const adminInput = administratorStepSchema.parse(parsed.payload);
          const adminRoleCode =
            adminInput.roleCode ??
            template?.roles.find((role) => role.code.includes("ADMIN"))?.code ??
            template?.roles[0]?.code;
          if (!adminRoleCode) {
            throw new ForgeError("BAD_REQUEST", "Administrator role code is required");
          }
          nextSessionData.adminEmail = adminInput.email.toLowerCase();
          nextSessionData.adminFirstName = adminInput.firstName;
          nextSessionData.adminLastName = adminInput.lastName;
          nextSessionData.adminRoleCode = adminRoleCode;
          stepPayload = {
            email: nextSessionData.adminEmail,
            firstName: adminInput.firstName,
            lastName: adminInput.lastName,
            roleCode: adminRoleCode,
          };
          break;
        }
        case "SEND_INVITATION": {
          const inviteInput = invitationStepSchema.parse(parsed.payload);
          if (
            !nextSessionData.adminEmail ||
            !nextSessionData.adminFirstName ||
            !nextSessionData.adminLastName ||
            !nextSessionData.adminRoleCode
          ) {
            throw new ForgeError("BAD_REQUEST", "Primary administrator details are required");
          }
          if (template) {
            await this.ensureStarterRoles(tenantId, template, principal);
          }
          const invitation = await this.invitations.create(
            {
              tenantId,
              email: nextSessionData.adminEmail,
              firstName: nextSessionData.adminFirstName,
              lastName: nextSessionData.adminLastName,
              organizationId: nextSessionData.primaryOrganizationId,
              roleCodes: [nextSessionData.adminRoleCode],
              productCodes: nextSessionData.productCodes ?? [],
              moduleCodes: nextSessionData.moduleCodes ?? [],
              expiresInHours: inviteInput.expiresInHours,
              send: inviteInput.send,
            },
            principal,
          );
          nextSessionData.invitationId = invitation.id;
          stepPayload = {
            invitationId: invitation.id,
            email: nextSessionData.adminEmail,
            send: inviteInput.send,
            status: invitation.status,
          };
          break;
        }
        case "REVIEW_CONFIGURATION": {
          const reviewInput = reviewStepSchema.parse(parsed.payload);
          const security = reviewInput.security ?? {
            mfaRequired: false,
            sessionTimeoutMinutes: 480,
            passwordPolicy: "STANDARD" as const,
          };
          await this.configuration.put(
            tenantId,
            "security",
            "defaults",
            { value: security },
            principal,
          );
          nextSessionData.securityConfigured = true;
          nextSessionData.reviewed = reviewInput.acknowledged;
          stepPayload = { acknowledged: reviewInput.acknowledged, security };
          break;
        }
        default:
          throw new ForgeError("BAD_REQUEST", `Unsupported onboarding step ${parsed.stepKey}`);
      }
    } catch (error) {
      if (error instanceof ForgeError) {
        validationErrors.push({ code: error.code, message: error.message });
      } else {
        validationErrors.push({
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Step failed",
        });
      }
      await this.markStepFailed(
        tenantId,
        session,
        steps,
        parsed.stepKey,
        validationErrors,
        principal,
        expectedVersion,
      );
      throw error;
    }

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const current = await tx.query.customerOnboardingSessions.findFirst({
          where: eq(customerOnboardingSessions.id, sessionId),
        });
        if (!current) {
          throw new ForgeError("NOT_FOUND", "Onboarding session not found");
        }
        const version = this.assertSessionVersion(
          current.recordVersion,
          expectedVersion,
          tenantId,
          sessionId,
        );

        const stepRow = steps.find((step) => step.stepKey === parsed.stepKey);
        if (!stepRow) {
          throw new ForgeError("NOT_FOUND", "Onboarding step not found");
        }
        const maxStep = Math.max(...steps.map((step) => step.stepNumber), 1);
        const nextStepNumber = Math.min(stepRow.stepNumber + 1, maxStep);

        const [updatedSession] = await tx
          .update(customerOnboardingSessions)
          .set({
            sessionDataJson: nextSessionData,
            currentStep: Math.max(current.currentStep, nextStepNumber),
            activationErrorsJson: [],
            recordVersion: version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(customerOnboardingSessions.id, sessionId),
              eq(customerOnboardingSessions.recordVersion, version),
            ),
          )
          .returning();
        if (!updatedSession) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "onboarding_session",
            resourceId: sessionId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await tx
          .update(customerOnboardingSteps)
          .set({
            status: "COMPLETED",
            payloadJson: stepPayload,
            validationErrorsJson: [],
            completedByUserId: principal.userId,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(customerOnboardingSteps.id, stepRow.id));

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "onboarding.step.complete",
          resourceType: "customer_onboarding_session",
          resourceId: sessionId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { stepKey: parsed.stepKey },
          after: stepPayload,
        });
      },
      principal.userId,
    );

    return this.getSession(sessionId, tenantId);
  }

  async activate(
    sessionId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    tenantIdHint?: string,
  ): Promise<
    OnboardingSessionView & {
      activationErrors: ActivationError[];
      tenant: Awaited<ReturnType<TenantsService["getById"]>>;
    }
  > {
    const resolved = await this.resolveSession(sessionId, tenantIdHint);
    const { session, steps } = resolved;
    const tenantId = session.tenantId;
    const sessionData = this.readSessionData(session);

    this.assertStepUnlocked(steps, "ACTIVATE_TENANT");
    for (const step of steps) {
      if (step.stepKey === "ACTIVATE_TENANT") {
        continue;
      }
      if (step.status !== "COMPLETED" && step.status !== "SKIPPED") {
        throw new ForgeError(
          "CONFLICT",
          `Step ${step.stepKey} must be completed before activation`,
        );
      }
    }

    const activationErrors = await this.runActivationChecks(tenantId, sessionData, steps);
    if (activationErrors.length > 0) {
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const current = await tx.query.customerOnboardingSessions.findFirst({
            where: eq(customerOnboardingSessions.id, sessionId),
          });
          if (!current) {
            return;
          }
          const version = this.assertSessionVersion(
            current.recordVersion,
            expectedVersion,
            tenantId,
            sessionId,
          );
          await tx
            .update(customerOnboardingSessions)
            .set({
              activationErrorsJson: activationErrors,
              recordVersion: version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(customerOnboardingSessions.id, sessionId),
                eq(customerOnboardingSessions.recordVersion, version),
              ),
            );
        },
        principal.userId,
      );
      throw new ForgeError("BAD_REQUEST", "Activation checks failed", {
        details: activationErrors,
      });
    }

    await this.ensureDefaultFacility(tenantId, principal, sessionData);

    const tenantBefore = await this.tenants.getById(tenantId);
    const activatedTenant = await this.tenants.activate(
      tenantId,
      principal,
      tenantBefore.recordVersion,
      { fromOnboarding: true },
    );

    const now = new Date();
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const current = await tx.query.customerOnboardingSessions.findFirst({
          where: eq(customerOnboardingSessions.id, sessionId),
        });
        if (!current) {
          throw new ForgeError("NOT_FOUND", "Onboarding session not found");
        }
        const version = this.assertSessionVersion(
          current.recordVersion,
          expectedVersion,
          tenantId,
          sessionId,
        );

        const [updatedSession] = await tx
          .update(customerOnboardingSessions)
          .set({
            status: "COMPLETED",
            currentStep: steps.length,
            activationErrorsJson: [],
            completedAt: now,
            recordVersion: version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerOnboardingSessions.id, sessionId),
              eq(customerOnboardingSessions.recordVersion, version),
            ),
          )
          .returning();
        if (!updatedSession) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "onboarding_session",
            resourceId: sessionId,
            expectedVersion,
            actualVersion: null,
          });
        }

        const activateStep = steps.find((step) => step.stepKey === "ACTIVATE_TENANT");
        if (activateStep) {
          await tx
            .update(customerOnboardingSteps)
            .set({
              status: "COMPLETED",
              payloadJson: { tenantId, status: "ACTIVE" },
              validationErrorsJson: [],
              completedByUserId: principal.userId,
              completedAt: now,
              updatedAt: now,
            })
            .where(eq(customerOnboardingSteps.id, activateStep.id));
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "customer_onboarding_session",
          aggregateId: sessionId,
          eventType: DOMAIN_EVENT_TYPES.ONBOARDING_COMPLETED,
          payload: {
            sessionId,
            tenantId,
            customerType: session.customerType,
            templateCode: session.templateCode,
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "onboarding.activate",
          resourceType: "customer_onboarding_session",
          resourceId: sessionId,
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { tenantId, status: "ACTIVE" },
        });
      },
      principal.userId,
    );

    const view = await this.getSession(sessionId, tenantId);
    return { ...view, activationErrors: [], tenant: activatedTenant };
  }

  private async runActivationChecks(
    tenantId: string,
    sessionData: OnboardingSessionData,
    steps: (typeof customerOnboardingSteps.$inferSelect)[],
  ): Promise<ActivationError[]> {
    const errors: ActivationError[] = [];

    if (steps.some((step) => step.status === "FAILED")) {
      errors.push({
        code: "FAILED_STEP",
        message: "One or more onboarding steps failed",
      });
    }

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const orgId = sessionData.primaryOrganizationId;
      const organization = orgId
        ? await tx.query.organizations.findFirst({
            where: and(eq(organizations.id, orgId), eq(organizations.tenantId, tenantId)),
          })
        : null;
      if (!organization) {
        errors.push({
          code: "PRIMARY_ORGANIZATION_MISSING",
          message: "Primary organization must exist before activation",
        });
      }

      const activeProducts = await tx.query.tenantProducts.findMany({
        where: and(eq(tenantProducts.tenantId, tenantId), eq(tenantProducts.status, "ACTIVE")),
      });
      if (activeProducts.length === 0) {
        errors.push({
          code: "PRODUCT_MISSING",
          message: "At least one product must be enabled",
        });
      }

      if (sessionData.subscriptionWaived) {
        // Explicit waiver recorded during CONFIGURE_SUBSCRIPTION.
      } else {
        const subscription = await tx.query.subscriptions.findFirst({
          where: and(
            eq(subscriptions.tenantId, tenantId),
            inArray(subscriptions.status, ["ACTIVE", "TRIAL", "GRACE"]),
          ),
        });
        if (!subscription) {
          errors.push({
            code: "SUBSCRIPTION_INVALID",
            message: "Subscription must be valid or explicitly waived",
          });
        }
      }

      const adminEmail = sessionData.adminEmail?.toLowerCase();
      const invitation = sessionData.invitationId
        ? await tx.query.userInvitations.findFirst({
            where: and(
              eq(userInvitations.id, sessionData.invitationId),
              eq(userInvitations.tenantId, tenantId),
            ),
          })
        : adminEmail
          ? await tx.query.userInvitations.findFirst({
              where: and(
                eq(userInvitations.tenantId, tenantId),
                eq(userInvitations.email, adminEmail),
              ),
            })
          : null;
      if (!invitation || !["DRAFT", "PENDING", "SENT", "ACCEPTED"].includes(invitation.status)) {
        errors.push({
          code: "ADMIN_INVITATION_MISSING",
          message: "Primary administrator invitation must exist",
        });
      }

      const securitySetting = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, "security"),
          eq(tenantSettings.settingKey, "defaults"),
        ),
      });
      if (!securitySetting && !sessionData.securityConfigured) {
        errors.push({
          code: "SECURITY_INVALID",
          message: "Security configuration must be valid",
        });
      }

      const branding = await tx.query.tenantBranding.findFirst({
        where: eq(tenantBranding.tenantId, tenantId),
      });
      if (!branding && !sessionData.brandingConfigured) {
        errors.push({
          code: "BRANDING_INVALID",
          message: "Branding defaults must be configured",
        });
      }

      // Facility may be auto-created at activate; absence alone is not a hard
      // fail here — ensureDefaultFacility runs after checks pass.
    });

    return errors;
  }

  /**
   * Ensures at least one facility exists for the tenant (MK-S7).
   * Creates `default` / Primary Facility when the catalog is empty.
   */
  async ensureDefaultFacility(
    tenantId: string,
    principal: ForgePrincipal,
    sessionData: OnboardingSessionData,
  ): Promise<{ id: string; created: boolean }> {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.facilities.findFirst({
          where: eq(facilities.tenantId, tenantId),
        });
        if (existing) {
          return { id: existing.id, created: false };
        }
        const byKey = await tx.query.facilities.findFirst({
          where: and(
            eq(facilities.tenantId, tenantId),
            eq(facilities.facilityKey, DEFAULT_ONBOARDING_FACILITY.facilityKey),
          ),
        });
        if (byKey) {
          return { id: byKey.id, created: false };
        }
        const now = new Date();
        const id = createId();
        await tx.insert(facilities).values({
          id,
          tenantId,
          organizationId: sessionData.primaryOrganizationId ?? null,
          facilityKey: DEFAULT_ONBOARDING_FACILITY.facilityKey,
          name: DEFAULT_ONBOARDING_FACILITY.name,
          facilityType: DEFAULT_ONBOARDING_FACILITY.facilityType,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "facility.create",
          resourceType: "facility",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { facilityKey: DEFAULT_ONBOARDING_FACILITY.facilityKey, source: "onboarding" },
        });
        return { id, created: true };
      },
      principal.userId,
    );
  }

  listTemplates() {
    return STARTER_TEMPLATES.map((template) => ({
      code: template.code,
      name: template.name,
      customerType: template.customerType,
      productCode: template.productCode,
      organizationTypeCode: template.organizationTypeCode,
      modules: template.modules,
      roles: template.roles.map((role) => ({ code: role.code, name: role.name })),
      onboarding: {
        steps: resolveOnboardingSteps(template.onboarding ?? null, [...ONBOARDING_STEPS]),
        skipStepKeys: template.onboarding?.skipStepKeys ?? [],
      },
    }));
  }

  private async ensureStarterRoles(
    tenantId: string,
    template: StarterTemplate,
    principal: ForgePrincipal,
  ): Promise<void> {
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        for (const roleDef of template.roles) {
          const existing = await tx.query.roles.findFirst({
            where: and(eq(roles.tenantId, tenantId), eq(roles.code, roleDef.code)),
          });
          if (existing) {
            continue;
          }

          const templateRow = await tx.query.roleTemplates.findFirst({
            where: eq(roleTemplates.code, roleDef.code),
          });
          if (!templateRow) {
            throw new ForgeError("INTERNAL_ERROR", `Role template ${roleDef.code} is not seeded`);
          }

          const roleId = createId();
          const now = new Date();
          await tx.insert(roles).values({
            id: roleId,
            tenantId,
            roleTemplateId: templateRow.id,
            code: roleDef.code,
            name: roleDef.name,
            description: `${roleDef.name} (starter template)`,
            status: "ACTIVE",
            isSystemManaged: true,
            createdAt: now,
            updatedAt: now,
          });

          const templatePermRows = await tx
            .select({ permissionId: roleTemplatePermissions.permissionId })
            .from(roleTemplatePermissions)
            .where(eq(roleTemplatePermissions.roleTemplateId, templateRow.id));

          if (templatePermRows.length > 0) {
            await tx.insert(rolePermissions).values(
              templatePermRows.map((row) => ({
                roleId,
                permissionId: row.permissionId,
                effect: "ALLOW" as const,
                createdAt: now,
              })),
            );
            continue;
          }

          const permissionRows = await tx.query.permissions.findMany({
            where: inArray(permissions.code, [...roleDef.permissions]),
          });
          if (permissionRows.length > 0) {
            await tx.insert(rolePermissions).values(
              permissionRows.map((row) => ({
                roleId,
                permissionId: row.id,
                effect: "ALLOW" as const,
                createdAt: now,
              })),
            );
          }
        }
      },
      principal.userId,
    );
  }

  private async markStepFailed(
    tenantId: string,
    session: typeof customerOnboardingSessions.$inferSelect,
    steps: (typeof customerOnboardingSteps.$inferSelect)[],
    stepKey: string,
    validationErrors: ActivationError[],
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ): Promise<void> {
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const version = this.assertSessionVersion(
          session.recordVersion,
          expectedVersion,
          tenantId,
          session.id,
        );
        await tx
          .update(customerOnboardingSessions)
          .set({
            activationErrorsJson: validationErrors,
            recordVersion: version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(customerOnboardingSessions.id, session.id),
              eq(customerOnboardingSessions.recordVersion, version),
            ),
          );

        const stepRow = steps.find((step) => step.stepKey === stepKey);
        if (stepRow) {
          await tx
            .update(customerOnboardingSteps)
            .set({
              status: "FAILED",
              validationErrorsJson: validationErrors,
              updatedAt: new Date(),
            })
            .where(eq(customerOnboardingSteps.id, stepRow.id));
        }

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "onboarding.step.fail",
          resourceType: "customer_onboarding_session",
          resourceId: session.id,
          result: "FAILURE",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { stepKey, validationErrors },
        });
      },
      principal.userId,
    );
  }

  private async resolveSession(
    sessionId: string,
    tenantIdHint?: string,
  ): Promise<{
    session: typeof customerOnboardingSessions.$inferSelect;
    steps: (typeof customerOnboardingSteps.$inferSelect)[];
  }> {
    if (tenantIdHint) {
      return withTenantTransaction(this.db, tenantIdHint, async (tx) =>
        this.loadSession(tx, sessionId, tenantIdHint),
      );
    }

    const tenantRows = await this.tenants.list();
    for (const tenant of tenantRows) {
      const resolved = await withTenantTransaction(this.db, tenant.id, async (tx) => {
        const session = await tx.query.customerOnboardingSessions.findFirst({
          where: eq(customerOnboardingSessions.id, sessionId),
        });
        if (!session) {
          return null;
        }
        const steps = await tx.query.customerOnboardingSteps.findMany({
          where: eq(customerOnboardingSteps.sessionId, sessionId),
          orderBy: [asc(customerOnboardingSteps.stepNumber)],
        });
        return { session, steps };
      });
      if (resolved) {
        return resolved;
      }
    }

    throw new ForgeError("NOT_FOUND", "Onboarding session not found");
  }

  private async loadSession(
    tx: DatabaseTransaction,
    sessionId: string,
    tenantId: string,
  ): Promise<{
    session: typeof customerOnboardingSessions.$inferSelect;
    steps: (typeof customerOnboardingSteps.$inferSelect)[];
  }> {
    const session = await tx.query.customerOnboardingSessions.findFirst({
      where: and(
        eq(customerOnboardingSessions.id, sessionId),
        eq(customerOnboardingSessions.tenantId, tenantId),
      ),
    });
    if (!session) {
      throw new ForgeError("NOT_FOUND", "Onboarding session not found");
    }
    const steps = await tx.query.customerOnboardingSteps.findMany({
      where: eq(customerOnboardingSteps.sessionId, sessionId),
      orderBy: [asc(customerOnboardingSteps.stepNumber)],
    });
    return { session, steps };
  }

  private toView(
    session: typeof customerOnboardingSessions.$inferSelect,
    steps: (typeof customerOnboardingSteps.$inferSelect)[],
  ): OnboardingSessionView {
    return {
      session,
      steps,
      template: this.resolveTemplate(session),
    };
  }

  private resolveTemplate(
    session: typeof customerOnboardingSessions.$inferSelect,
  ): StarterTemplate | null {
    if (session.templateCode) {
      return findStarterTemplate(session.templateCode) ?? null;
    }
    return (
      findStarterTemplateForCustomerType(session.customerType as StarterTemplate["customerType"]) ??
      null
    );
  }

  private readSessionData(
    session: typeof customerOnboardingSessions.$inferSelect,
  ): OnboardingSessionData {
    return (session.sessionDataJson ?? {}) as OnboardingSessionData;
  }

  private assertKnownStep(stepKey: string): asserts stepKey is OnboardingStepKey {
    if (!ONBOARDING_STEPS.some((step) => step.key === stepKey)) {
      throw new ForgeError("BAD_REQUEST", `Unknown onboarding step ${stepKey}`);
    }
  }

  private assertStepUnlocked(
    steps: (typeof customerOnboardingSteps.$inferSelect)[],
    stepKey: OnboardingStepKey,
  ): void {
    const target = steps.find((step) => step.stepKey === stepKey);
    if (!target) {
      throw new ForgeError("BAD_REQUEST", `Unknown onboarding step ${stepKey}`);
    }
    const incompletePrior = steps.some(
      (step) =>
        step.stepNumber < target.stepNumber &&
        step.status !== "COMPLETED" &&
        step.status !== "SKIPPED",
    );
    if (incompletePrior) {
      throw new ForgeError("CONFLICT", "Complete prior onboarding steps first");
    }
  }

  private assertSessionVersion(
    current: number,
    expected: ExpectedVersion,
    tenantId: string,
    sessionId: string,
  ): number {
    if (expected !== "*" && current !== expected) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "onboarding_session",
        resourceId: sessionId,
        expectedVersion: expected,
        actualVersion: current,
      });
    }
    return current;
  }
}
