import { z } from "zod";

export const apiMetaSchema = z.object({
  requestId: z.string(),
  correlationId: z.string(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  total: z.number().int().nonnegative().optional(),
});

export type ApiMeta = z.infer<typeof apiMetaSchema>;

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
    correlationId: string;
  };
}

export const PLATFORM_PERMISSIONS = [
  "platform.tenant.read",
  "platform.tenant.create",
  "platform.tenant.update",
  "platform.tenant.suspend",
  "platform.organization.read",
  "platform.organization.create",
  "tenant.facilities.read",
  "tenant.facilities.manage",
  "platform.person.read",
  "platform.person.create",
  "platform.person.update",
  "platform.person.merge",
  "platform.user.invite",
  "platform.role.assign",
  "platform.permission.read",
  "platform.audit.read",
  "platform.audit.export",
  "platform.feature.manage",
  "platform.entitlement.manage",
  "platform.configuration.update",
  "platform.configuration.publish",
  "tenant.configuration.update",
  "tenant.configuration.publish",
  "platform.sensitive_data.read",
  "platform.invitation.read",
  "platform.invitation.manage",
  "platform.membership.read",
  "platform.membership.manage",
  "platform.onboarding.manage",
  "tenant.notification.read",
  "tenant.notification.manage",
  "tenant.api_key.read",
  "tenant.api_key.manage",
  "tenant.webhook.read",
  "tenant.webhook.manage",
  "platform.jobs.read",
  "tenant.export.read",
  "tenant.export.create",
  "platform.analytics.read",
  "platform.neris.schema.read",
  "platform.neris.schema.import",
  "platform.neris.overlay.read",
  "platform.neris.overlay.manage",
  "platform.cad.adapter.manage",
  "platform.cad.mapping_template.manage",
  "platform.cad.global_diagnostics.view",
  "platform.ai.narrative.manage",
  "platform.ai.provider.manage",
  "platform.ai.policy.manage",
  "platform.ai.usage.view",
] as const;

/** Universal Import Platform permissions (unscoped names; assignment decides principal scope). */
export const IMPORT_PERMISSIONS = [
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

export type ImportPermission = (typeof IMPORT_PERMISSIONS)[number];

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/**
 * Permissions that only a platform (creator) principal may hold or grant.
 * A tenant administrator is refused when it tries to grant any of these,
 * independently of the permissions it holds itself.
 */
export const CREATOR_ONLY_PERMISSIONS = [
  "platform.tenant.create",
  "platform.tenant.suspend",
  "platform.onboarding.manage",
  "platform.analytics.read",
  "platform.entitlement.manage",
  "platform.neris.schema.import",
  "platform.cad.adapter.manage",
  "platform.cad.mapping_template.manage",
  "platform.cad.global_diagnostics.view",
  "platform.ai.narrative.manage",
  "platform.ai.provider.manage",
  "platform.ai.policy.manage",
] as const satisfies readonly PlatformPermission[];

export function isCreatorOnlyPermission(code: string): boolean {
  return (CREATOR_ONLY_PERMISSIONS as readonly string[]).includes(code);
}

export const createTenantInputSchema = z.object({
  tenantKey: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  legalName: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  tenantType: z.string().min(1).max(64).default("CUSTOMER"),
  timezone: z.string().min(1).max(64).default("America/Chicago"),
  defaultLocale: z.string().min(2).max(16).default("en-US"),
  dataRegion: z.string().min(2).max(32).default("us-east-1"),
});

export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;

export {
  TENANT_STATUSES,
  LEGACY_INACTIVE_TENANT_STATUSES,
  isTenantStatus,
  TENANT_STATUS_TRANSITIONS,
  canTransitionTenantStatus,
  assertTenantStatusTransition,
  facilityBelongsToTenant,
  createFacilityInputSchema,
  patchFacilityInputSchema,
} from "./tenant-domain.js";
export type { TenantStatus, CreateFacilityInput, PatchFacilityInput } from "./tenant-domain.js";

export {
  BRANDING_ASSET_KINDS,
  brandingAssetUploadInputSchema,
  brandingObjectKeyPrefix,
  documentBelongsToTenant,
  isSignedAccessExpired,
  objectKeyBelongsToTenant,
  pickThemeLogoUrl,
  putTenantBrandingInputSchema,
  type BrandingAssetKind,
  type BrandingAssetUploadInput,
  type PutTenantBrandingInput,
} from "./branding-domain.js";

export {
  API_KEY_PREFIX,
  createApiKeyInputSchema,
  createWebhookDeliveryInputSchema,
  createWebhookEndpointInputSchema,
  patchWebhookEndpointInputSchema,
  type CreateApiKeyInput,
  type CreateWebhookDeliveryInput,
  type CreateWebhookEndpointInput,
  type PatchWebhookEndpointInput,
} from "./api-keys-webhooks-domain.js";

export {
  SEARCH_ENTITY_TYPES,
  SEARCH_GROUP_LABELS,
  searchGroupSchema,
  searchHitSchema,
  searchQuerySchema,
  searchResponseSchema,
  type SearchEntityType,
  type SearchGroup,
  type SearchHit,
  type SearchQueryInput,
  type SearchResponse,
} from "./search-domain.js";

export {
  PLATFORM_JOB_STATUSES,
  PLATFORM_JOB_TYPES,
  listPlatformJobsQuerySchema,
  platformJobSchema,
  type ListPlatformJobsQuery,
  type PlatformJob,
  type PlatformJobStatus,
  type PlatformJobType,
} from "./jobs-domain.js";

export {
  EXPORT_DOWNLOAD_TTL_SECONDS,
  EXPORT_KINDS,
  EXPORT_KIND_TO_JOB_TYPE,
  EXPORT_SYNC_ROW_LIMIT,
  createExportInputSchema,
  exportDownloadSchema,
  type CreateExportInput,
  type ExportDownload,
  type ExportKind,
} from "./exports-domain.js";

export {
  platformAnalyticsOverviewSchema,
  platformAnalyticsActivityItemSchema,
  type PlatformAnalyticsOverview,
} from "./platform-analytics-domain.js";

export {
  EMAIL_TEMPLATE_KEYS,
  NOTIFICATION_DESTINATIONS,
  NOTIFICATION_PRIORITIES,
  createNotificationInputSchema,
  type CreateNotificationInput,
  type EmailAttachment,
  type EmailMessage,
  type EmailSendResult,
  type EmailTemplateKey,
  type NotificationDestination,
  type NotificationPriority,
} from "./notification-domain.js";

export const createOrganizationInputSchema = z.object({
  organizationTypeCode: z.string().min(1).max(64),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  legalName: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  parentOrganizationId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  timezone: z.string().max(64).optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const createPersonInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  suffix: z.string().max(40).optional(),
  preferredName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  recordSource: z.string().max(64).default("MANUAL"),
});

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

// ---------------------------------------------------------------------------
// Invitations (ADR-020 / FORGE-SAAS MK-S6)
// ---------------------------------------------------------------------------

export {
  INVITATION_STORAGE_STATUSES as INVITATION_STATUSES,
  TERMINAL_INVITATION_STORAGE_STATUSES as TERMINAL_INVITATION_STATUSES,
  ACTIVE_INVITATION_STORAGE_STATUSES,
  SAAS_INVITATION_STATUS_ALIASES,
  isInvitationStorageStatus,
  resolveInvitationStatusAlias,
  isTerminalInvitationStatus,
  isActiveInvitationStatus,
  invitationStatusesForSaasPending,
  emailsMatchForInvitationAccept,
  INVITATION_RESEND_EXTEND_HOURS,
} from "./invitation-domain.js";
export type {
  InvitationStorageStatus as InvitationStatus,
  SaasInvitationStatusAlias,
} from "./invitation-domain.js";

export const createInvitationInputSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email().max(320),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  organizationId: z.string().uuid().optional(),
  /** Tenant-owned facility IDs scoping the invited membership. */
  facilityIds: z.array(z.string().uuid()).max(100).default([]),
  roleCodes: z.array(z.string().min(1).max(64)).max(20).default([]),
  productCodes: z.array(z.string().min(1).max(64)).max(20).default([]),
  moduleCodes: z.array(z.string().min(1).max(64)).max(50).default([]),
  expiresInHours: z.number().int().min(1).max(720).default(168),
  /** When false the invitation is stored as DRAFT and no Cognito user is created. */
  send: z.boolean().default(true),
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

export const acceptInvitationInputSchema = z.object({
  token: z.string().min(16).max(512),
  /** Cognito subject of the authenticated identity accepting the invitation. */
  cognitoSubject: z.string().min(1).max(255).optional(),
  /**
   * When provided, must match the invitation email (case-insensitive).
   * Use to bind the accepting identity email to the invite.
   */
  email: z.string().email().max(320).optional(),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

export const setMembershipFacilityScopeInputSchema = z.object({
  facilityIds: z.array(z.string().uuid()).max(100),
});

export type SetMembershipFacilityScopeInput = z.infer<typeof setMembershipFacilityScopeInputSchema>;

// ---------------------------------------------------------------------------
// Memberships (ADR-021)
// ---------------------------------------------------------------------------

export {
  MEMBERSHIP_STATUSES,
  SAAS_MEMBERSHIP_STATUS_ALIASES,
  isMembershipStatus,
  resolveMembershipStatusAlias,
  isMembershipStatusActive,
  membershipStatusBlocksTenantSelection,
} from "./membership-domain.js";
export type { MembershipStatus, SaasMembershipStatusAlias } from "./membership-domain.js";

// ---------------------------------------------------------------------------
// RBAC (FORGE-SAAS MK-S4)
// ---------------------------------------------------------------------------

export {
  CORE_SAAS_PERMISSIONS,
  TENANT_OWNER_PERMISSIONS,
  TENANT_ADMIN_PERMISSIONS,
  STANDARD_USER_PERMISSIONS,
  READ_ONLY_USER_PERMISSIONS,
  SAAS_ROLE_PERSONAS,
  SAAS_PERSONA_TO_ROLE_TEMPLATE,
  SAAS_PERSONA_PERMISSIONS,
  isSaasRolePersona,
  resolveSaasRolePersona,
  roleTemplateCodeForSaasPersona,
  permissionsForSaasPersona,
  saasPersonaHasPermission,
  isSaasMutationPermission,
} from "./rbac-domain.js";
export type {
  CoreSaasPermission,
  SaasRolePersona,
  SaasPersonaRoleTemplateCode,
} from "./rbac-domain.js";

// ---------------------------------------------------------------------------
// Entitlements (FORGE-SAAS MK-S5)
// ---------------------------------------------------------------------------

export {
  PLATFORM_PRODUCT_CODES,
  PLATFORM_PRODUCT_CATALOG,
  getEntitlements,
  getTenantProducts,
  getTenantModules,
  isProductEnabled,
  isModuleEnabled,
  isModuleEntitlementWithinWindow,
  isPlatformProductCode,
} from "./entitlement-domain.js";
export type {
  PlatformProductCode,
  EntitlementSnapshot,
  EntitlementSetLike,
} from "./entitlement-domain.js";

export const createMembershipInputSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["PENDING", "ACTIVE"]).default("PENDING"),
  isDefaultTenant: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
  roleCodes: z.array(z.string().min(1).max(64)).max(20).default([]),
  productCodes: z.array(z.string().min(1).max(64)).max(20).default([]),
  moduleCodes: z.array(z.string().min(1).max(64)).max(50).default([]),
});

export type CreateMembershipInput = z.infer<typeof createMembershipInputSchema>;

export const patchMembershipInputSchema = z.object({
  isDefaultTenant: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const setMembershipRolesInputSchema = z.object({
  roles: z
    .array(
      z.object({
        roleCode: z.string().min(1).max(64),
        organizationId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(50),
});

export const setMembershipProductsInputSchema = z.object({
  productCodes: z.array(z.string().min(1).max(64)).max(20),
  moduleCodes: z.array(z.string().min(1).max(64)).max(50).default([]),
});

// ---------------------------------------------------------------------------
// Subscriptions (ADR-019 states, extended in Sprint 1E)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PAYMENT_DUE",
  "GRACE_PERIOD",
  "READ_ONLY",
  "SUSPENDED",
  "TERMINATED",
  "ARCHIVED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses that permit writes. Everything else is read-only or blocked. */
export const WRITABLE_SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PAYMENT_DUE",
  "GRACE_PERIOD",
] as const satisfies readonly SubscriptionStatus[];

/** Statuses that still permit reads. No status ever deletes customer data. */
export const READABLE_SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PAYMENT_DUE",
  "GRACE_PERIOD",
  "READ_ONLY",
  "ARCHIVED",
] as const satisfies readonly SubscriptionStatus[];

// ---------------------------------------------------------------------------
// Onboarding (ADR-027)
// ---------------------------------------------------------------------------

export const CUSTOMER_TYPES = ["INDUSTRIAL", "FIRE_DEPARTMENT", "FIRE_ACADEMY", "OTHER"] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const ONBOARDING_STEPS = [
  { number: 1, key: "CREATE_TENANT", label: "Create company" },
  { number: 2, key: "SELECT_CUSTOMER_TYPE", label: "Select company type" },
  { number: 3, key: "CREATE_PRIMARY_ORGANIZATION", label: "Create primary organization" },
  { number: 4, key: "SELECT_PRODUCTS", label: "Select products" },
  { number: 5, key: "SELECT_MODULES", label: "Select modules" },
  { number: 6, key: "CONFIGURE_SUBSCRIPTION", label: "Configure subscription" },
  { number: 7, key: "CONFIGURE_LOCATIONS", label: "Configure locations" },
  { number: 8, key: "CONFIGURE_ORG_LOOKUPS", label: "Configure organization setup" },
  { number: 9, key: "CONFIGURE_DATA_IMPORT", label: "Import company data" },
  { number: 10, key: "CONFIGURE_DOCUMENTS", label: "Upload company documents" },
  { number: 11, key: "CONFIGURE_BRANDING", label: "Configure branding" },
  { number: 12, key: "CONFIGURE_BUSINESS_SETTINGS", label: "Configure business settings" },
  { number: 13, key: "CREATE_PRIMARY_ADMINISTRATOR", label: "Create primary administrator" },
  { number: 14, key: "SEND_INVITATION", label: "Send invitation" },
  { number: 15, key: "REVIEW_CONFIGURATION", label: "Review configuration" },
  { number: 16, key: "ACTIVATE_TENANT", label: "Activate company" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export {
  DEFAULT_ONBOARDING_STEPS,
  REQUIRED_ONBOARDING_STEP_KEYS,
  ONBOARDING_ACTIVATION_ERROR_CODES,
  DEFAULT_ONBOARDING_FACILITY,
  resolveOnboardingSteps,
  isRequiredOnboardingStepKey,
} from "./onboarding-domain.js";
export type {
  DefaultOnboardingStepKey,
  OnboardingStepDefinition,
  OnboardingStepOverrides,
  OnboardingActivationErrorCode,
} from "./onboarding-domain.js";

export {
  SAAS_SUBSCRIPTION_STATUSES,
  OPERATIONAL_SUBSCRIPTION_STATUSES,
  BILLING_PROVIDERS,
  BILLING_TYPES,
  BILLING_FEE_TYPES,
  BILLING_CONTRACT_STATUSES,
  BILLING_ORDER_STATUSES,
  BILLING_INVOICE_STATUSES,
  PRICE_INTERVALS,
  BILLING_PROVIDER_EVENT_STATUSES,
  BILLING_LOGICAL_MODELS,
  BILLING_WEBHOOK_ENTITLEMENT_INVARIANT,
  toSaasSubscriptionStatus,
  toOperationalSubscriptionStatus,
  billingWebhookEnvelopeSchema,
  createBillingCustomerInputSchema,
  createBillingContractInputSchema,
  createBillingFeeInputSchema,
  patchBillingContractInputSchema,
  patchBillingCustomerInputSchema,
  PLAN_STATUSES,
  createSubscriptionPlanInputSchema,
  patchSubscriptionPlanInputSchema,
  createPlanPriceInputSchema,
  patchPlanPriceInputSchema,
  createBillingInvoiceInputSchema,
  patchBillingInvoiceInputSchema,
} from "./billing-domain.js";
export type {
  SaasSubscriptionStatus,
  OperationalSubscriptionStatus,
  BillingProviderCode,
  BillingType,
  BillingFeeType,
  BillingLogicalModel,
  BillingWebhookEnvelope,
} from "./billing-domain.js";

export const startOnboardingInputSchema = z.object({
  customerType: z.enum(CUSTOMER_TYPES),
  templateCode: z.string().min(1).max(64).optional(),
  tenantKey: createTenantInputSchema.shape.tenantKey,
  slug: createTenantInputSchema.shape.slug,
  legalName: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  timezone: z.string().min(1).max(64).default("America/Chicago"),
});

export type StartOnboardingInput = z.infer<typeof startOnboardingInputSchema>;

export const completeOnboardingStepInputSchema = z.object({
  stepKey: z.string().min(1).max(64),
  payload: z.record(z.unknown()).default({}),
});

export * from "./module-catalog.js";
export * from "./starter-templates.js";
export {
  RMS_PERMISSIONS,
  NERIS_INCIDENT_STATUSES,
  PREFILL_SOURCES,
  VALIDATION_SEVERITIES,
  VALIDATION_SOURCES,
  NUMBER_RESET_MODES,
  NUMBER_SCOPES,
  SPECIALTY_REVIEWER_ROLES,
  ATTACHMENT_CATEGORIES,
  pageQuerySchema,
  createStationInputSchema,
  createShiftInputSchema,
  createApparatusInputSchema,
  createUnitInputSchema,
  createRmsPersonnelInputSchema,
  createOccupancyInputSchema,
  createPreplanInputSchema,
  createIncidentInputSchema,
  patchIncidentInputSchema,
  upsertFieldValueInputSchema,
  batchUpsertFieldValuesInputSchema,
  submitReviewInputSchema,
  returnIncidentInputSchema,
  voidIncidentInputSchema,
  reviewCommentInputSchema,
  resolveReviewCommentInputSchema,
  reopenReviewCommentInputSchema,
  returnSpecialtySectionInputSchema,
  duplicateCheckInputSchema,
  upsertNarrativeInputSchema,
  createIncidentUnitInputSchema,
  patchIncidentUnitInputSchema,
  createIncidentPersonnelInputSchema,
  patchIncidentPersonnelInputSchema,
  prefillQuerySchema,
  initializeAttachmentUploadInputSchema,
  completeAttachmentUploadInputSchema,
  patchAttachmentInputSchema,
  createExposureInputSchema,
  patchExposureInputSchema,
  createCivilianCasualtyInputSchema,
  patchCivilianCasualtyInputSchema,
  createFireServiceCasualtyInputSchema,
  patchFireServiceCasualtyInputSchema,
  createHazmatSubstanceInputSchema,
  patchHazmatSubstanceInputSchema,
  createHazmatContainerInputSchema,
  patchHazmatContainerInputSchema,
  createAlarmSystemInputSchema,
  patchAlarmSystemInputSchema,
  createProtectionSystemInputSchema,
  patchProtectionSystemInputSchema,
  createOccupancyLinkInputSchema,
  createProposedMasterUpdateInputSchema,
  reviewProposedMasterUpdateInputSchema,
  sectionApprovalInputSchema,
  RMS_DEPARTMENT_ADMIN_PERMISSIONS,
  RMS_OFFICER_PERMISSIONS,
  RMS_MEMBER_INCIDENT_PERMISSIONS,
  RMS_SAFETY_OFFICER_PERMISSIONS,
  RMS_HAZMAT_OFFICER_PERMISSIONS,
  RMS_FIRE_INVESTIGATOR_PERMISSIONS,
  RMS_PREVENTION_OFFICER_PERMISSIONS,
  RMS_TRAINING_OFFICER_PERMISSIONS,
  type RmsPermission,
  type NerisIncidentStatus,
  type PrefillSource,
  type CreateIncidentInput,
} from "./rms-neris.js";
import { RMS_PERMISSIONS as _RMS_PERMISSIONS } from "./rms-neris.js";
import {
  ACADEMY_AI_NARRATIVE_PERMISSIONS,
  INDUSTRIAL_AI_NARRATIVE_PERMISSIONS,
} from "@forge/ai-contracts";
import { INDUSTRIAL_PERMISSIONS as _INDUSTRIAL_PERMISSIONS } from "./industrial.js";
import { INDUSTRIAL_MODULE_PAGE_PERMISSIONS as _INDUSTRIAL_MODULE_PAGE_PERMISSIONS } from "./industrial-module-pages.js";
import { FIELD_PERMISSIONS as _FIELD_PERMISSIONS } from "./field.js";
import { HELPDESK_PERMISSIONS as _HELPDESK_PERMISSIONS } from "./helpdesk.js";
export * from "./helpdesk.js";
export * from "./emergency-sms-consent.js";

export {
  INDUSTRIAL_PRODUCT_CODE,
  INDUSTRIAL_PERMISSIONS,
  INDUSTRIAL_MODULE_REGISTRY,
  INDUSTRIAL_FEATURE_FLAGS,
  industrialAvailabilityLabel,
  industrialModuleIsToggleable,
  industrialModulesByImplementation,
  type IndustrialPermission,
  type IndustrialMigrationStatus,
  type IndustrialImplementationStatus,
  type IndustrialModuleRegistryEntry,
} from "./industrial.js";

export {
  INDUSTRIAL_MODULE_ROLE_ACCESS,
  industrialModuleManagedPermissionCodes,
  industrialModuleNavPermissionOk,
  industrialModuleRoleAccess,
  industrialModulesWithRoleAccess,
  mergePermissionCodesWithModules,
  moduleCodesFromPermissionCodes,
  type IndustrialModuleRoleAccess,
} from "./industrial-module-permissions.js";

export {
  INDUSTRIAL_MODULE_PAGE_CATALOGS,
  INDUSTRIAL_MODULE_PAGE_PERMISSIONS,
  enabledPageIdsFromPermissionCodes,
  filterModulePages,
  industrialModulePageCatalog,
  isIndustrialModulePagePermission,
  managePermissionForModuleDomain,
  mergePermissionCodesWithModulePages,
  moduleCodeFromPagePermission,
  modulePagePermissionOk,
  pagePermissionCode,
  pagePermissionCodesForModule,
  type IndustrialModulePage,
  type IndustrialModulePageCatalog,
} from "./industrial-module-pages.js";

export {
  INDUSTRIAL_DASHBOARD_ATTENTION_SOURCES,
  filterIndustrialDashboardAttentionItems,
  industrialDashboardAttentionAllowed,
  industrialDashboardAttentionSource,
  type IndustrialDashboardAttentionSource,
} from "./industrial-dashboard-attention.js";

export {
  PrinterConnectionType,
  PrinterTransportType,
  ForgePrintMode,
  PrintJobStatus,
  BridgeStatus,
  BRADY_I4311_DPI,
  inchesToPixels,
  printerCapabilitiesSchema,
  printLabelLayoutSchema,
  createPrintJobInputSchema,
  previewPrintJobInputSchema,
  createPrintBatchItemSchema,
  createPrintBatchInputSchema,
  registerDirectBluetoothPrinterInputSchema,
  upsertPrinterProfileInputSchema,
  createMediaProfileInputSchema,
  patchMediaProfileInputSchema,
  createBridgePairingInputSchema,
  consumeBridgePairingInputSchema,
  bridgeHeartbeatInputSchema,
  bridgePrinterUpsertSchema,
  printJobStatusUpdateSchema,
  reprintJobInputSchema,
  PRINT_REPRINT_REASONS,
  PrinterGroupStrategy,
  printRouteConditionsSchema,
  printRouteActionSchema,
  createPrinterGroupInputSchema,
  patchPrinterGroupInputSchema,
  createPrintRoutingRuleInputSchema,
  patchPrintRoutingRuleInputSchema,
  resolvePrintRouteInputSchema,
  PrintManagerPrinterHealth,
  classifyPrintManagerPrinterHealth,
  PRINT_MANAGER_QUEUED_STATUSES,
  PRINT_MANAGER_PRINTING_STATUSES,
  PRINT_MANAGER_SUCCESS_STATUSES,
  LabelTemplateVersionStatus,
  labelTemplateFieldInputSchema,
  labelTemplateLayoutSchema,
  createLabelTemplateInputSchema,
  patchLabelTemplateInputSchema,
  patchLabelTemplateVersionInputSchema,
  previewLabelTemplateInputSchema,
  exportLabelTemplateZplInputSchema,
  labelTemplateElementSchema,
  labelTemplateElementTypeSchema,
  PrintSupplyType,
  PrintSupplyAlertLevel,
  createPrintSupplyInputSchema,
  patchPrintSupplyInputSchema,
  replacePrintSupplyInputSchema,
  printAnalyticsQuerySchema,
  type PrinterCapabilities,
  type PrintLabelLayout,
  type CreatePrintJobInput,
  type PreviewPrintJobInput,
  type CreatePrintBatchItem,
  type CreatePrintBatchInput,
  type RegisterDirectBluetoothPrinterInput,
  type UpsertPrinterProfileInput,
  type CreateMediaProfileInput,
  type PatchMediaProfileInput,
  type CreateBridgePairingInput,
  type ConsumeBridgePairingInput,
  type BridgeHeartbeatInput,
  type BridgePrinterUpsert,
  type PrintJobStatusUpdate,
  type ReprintJobInput,
  type PrintReprintReason,
  type CreatePrinterGroupInput,
  type PatchPrinterGroupInput,
  type CreatePrintRoutingRuleInput,
  type PatchPrintRoutingRuleInput,
  type ResolvePrintRouteInput,
  type PrintRouteConditions,
  type PrintRouteAction,
  type LabelTemplateFieldInput,
  type LabelTemplateLayout,
  type CreateLabelTemplateInput,
  type PatchLabelTemplateInput,
  type PatchLabelTemplateVersionInput,
  type PreviewLabelTemplateInput,
  type ExportLabelTemplateZplInput,
  type LabelTemplateElement,
  type LabelTemplateElementType,
  type CreatePrintSupplyInput,
  type PatchPrintSupplyInput,
  type ReplacePrintSupplyInput,
  type PrintAnalyticsQuery,
} from "./industrial-print.js";

export {
  EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
  EXECUTIVE_WALKTHROUGH_TENANT_KEY,
  EXECUTIVE_WALKTHROUGH_SESSION_KEY,
  EXECUTIVE_WALKTHROUGH_SESSION_EVENT,
  EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS,
  EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS,
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE,
  EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME,
  EXECUTIVE_WALKTHROUGH_VOICE_DIRECTION,
  estimateWalkthroughRuntimeMs,
  type WalkthroughAction,
  type WalkthroughStep,
} from "./executive-walkthrough.js";

export {
  INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
  INDUSTRIAL_DEMO_TENANT_SLUG,
  INDUSTRIAL_DEMO_COMPANY_NAME,
  INDUSTRIAL_DEMO_TENANT_KEYS,
  isIndustrialDemoTenantKey,
  WALKTHROUGH_STUDIO_SESSION_KEY,
  WALKTHROUGH_STUDIO_SESSION_EVENT,
  WALKTHROUGH_TARGET_RUNTIME_MIN_MS,
  WALKTHROUGH_TARGET_RUNTIME_MAX_MS,
  WALKTHROUGH_RUNTIME_GREEN_MS,
  WALKTHROUGH_RUNTIME_YELLOW_MS,
  WALKTHROUGH_RUNTIME_ORANGE_MS,
  WALKTHROUGH_RUNTIME_MAX_MS,
  WALKTHROUGH_DEFAULT_WPM,
  WALKTHROUGH_SPEED_MIN,
  WALKTHROUGH_SPEED_MAX,
  WALKTHROUGH_SPEED_DEFAULT,
  WALKTHROUGH_TRANSITION_MS_DEFAULT,
  WALKTHROUGH_DEFAULT_VOICE_STYLE,
  WALKTHROUGH_VOICE_PROFILES,
  DEFAULT_WALKTHROUGH_VOICE_PROFILE_ID,
  WALKTHROUGH_STUDIO_PERMISSIONS,
  INDUSTRIAL_PLATFORM_WALKTHROUGH_CHAPTERS,
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  INDUSTRIAL_PLATFORM_WALKTHROUGH_FILENAME_PREFIX,
  DEMO_SEED_TARGETS,
  DEMO_LOCATIONS,
  DEMO_DIVISIONS,
  flattenWalkthroughScenes,
  estimateWalkthroughStudioRuntimeMs,
  getWalkthroughRuntimeStatus,
  estimateNarrationDurationMs,
  formatWalkthroughRuntime,
  buildWalkthroughMp4Filename,
  type WalkthroughRuntimeStatus,
  type WalkthroughStatus,
  type WalkthroughExportStatus,
  type WalkthroughCaptionMode,
  type WalkthroughTransitionType,
  type WalkthroughNarrationProvider,
  type WalkthroughVoiceGender,
  type WalkthroughVoiceProfile,
  type WalkthroughEngineAction,
  type WalkthroughScene,
  type WalkthroughChapter,
  type WalkthroughDefinition,
  type WalkthroughStudioPermission,
} from "./walkthrough-studio.js";

export {
  INDUSTRIAL_REPORTING_PERMISSIONS,
  REPORT_EXPORT_FORMATS,
  REPORT_DEFINITION_ORIGINS,
  REPORT_SYNC_ROW_LIMIT,
  SAFETY_DIRECTOR_RECIPIENT_MARKER,
  reportRunInputSchema,
  reportExportInputSchema,
  createSavedReportInputSchema,
  patchSavedReportInputSchema,
  createReportScheduleInputSchema,
  patchReportScheduleInputSchema,
  type IndustrialReportingPermission,
  type ReportExportFormat,
  type ReportRunInput,
  type ReportExportInput,
  type CreateSavedReportInput,
  type CreateReportScheduleInput,
} from "./reporting-domain.js";

export {
  FIELD_PRODUCT_SURFACE,
  FIELD_PERMISSIONS,
  FIELD_EMPLOYEE_PERMISSIONS,
  FIELD_SUPERVISOR_PERMISSIONS,
  type FieldPermission,
} from "./field.js";

/** All seeded permission codes (platform + RMS + industrial + field + product AI + import). */
export const ALL_PERMISSIONS = [
  ...PLATFORM_PERMISSIONS,
  ...IMPORT_PERMISSIONS,
  ..._RMS_PERMISSIONS,
  ..._INDUSTRIAL_PERMISSIONS,
  ..._INDUSTRIAL_MODULE_PAGE_PERMISSIONS,
  ..._FIELD_PERMISSIONS,
  ..._HELPDESK_PERMISSIONS,
  ...INDUSTRIAL_AI_NARRATIVE_PERMISSIONS,
  ...ACADEMY_AI_NARRATIVE_PERMISSIONS,
] as const;
export type AnyPermission = (typeof ALL_PERMISSIONS)[number];

export * from "@forge/ai-contracts";
