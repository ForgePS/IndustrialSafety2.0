/**
 * Provider-neutral billing domain (FORGE-SAAS MK-S9).
 * Entitlements remain the commercial source of truth (ADR-017).
 * Provider webhooks must never grant product/module access directly.
 */

import { z } from "zod";

/** SaaS-facing subscription statuses (ADR-019). */
export const SAAS_SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PAYMENT_DUE",
  "GRACE_PERIOD",
  "READ_ONLY",
  "SUSPENDED",
  "TERMINATED",
  "ARCHIVED",
] as const;

export type SaasSubscriptionStatus = (typeof SAAS_SUBSCRIPTION_STATUSES)[number];

/**
 * Operational statuses stored on `subscriptions.status` today.
 * Kept for compatibility with SubscriptionsService / AuthZ.
 */
export const OPERATIONAL_SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "GRACE",
  "SUSPENDED",
  "CANCELED",
] as const;

export type OperationalSubscriptionStatus = (typeof OPERATIONAL_SUBSCRIPTION_STATUSES)[number];

/** Map operational DB status → SaaS ADR-019 label. */
export function toSaasSubscriptionStatus(status: string): SaasSubscriptionStatus | null {
  switch (status) {
    case "TRIAL":
    case "ACTIVE":
      return "ACTIVE";
    case "GRACE":
    case "PAYMENT_DUE":
      return "GRACE_PERIOD";
    case "GRACE_PERIOD":
      return "GRACE_PERIOD";
    case "READ_ONLY":
      return "READ_ONLY";
    case "SUSPENDED":
      return "SUSPENDED";
    case "CANCELED":
    case "TERMINATED":
      return "TERMINATED";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return null;
  }
}

/** Map SaaS / alias input → operational DB status. */
export function toOperationalSubscriptionStatus(
  status: string,
): OperationalSubscriptionStatus | null {
  switch (status) {
    case "TRIAL":
      return "TRIAL";
    case "ACTIVE":
      return "ACTIVE";
    case "GRACE":
    case "GRACE_PERIOD":
    case "PAYMENT_DUE":
      return "GRACE";
    case "SUSPENDED":
    case "READ_ONLY":
      return "SUSPENDED";
    case "CANCELED":
    case "TERMINATED":
    case "ARCHIVED":
      return "CANCELED";
    default:
      return null;
  }
}

export const BILLING_PROVIDERS = ["NONE", "STUB", "STRIPE", "MANUAL"] as const;
export type BillingProviderCode = (typeof BILLING_PROVIDERS)[number];

export const BILLING_TYPES = [
  "MONTHLY",
  "ANNUAL",
  "PER_SEAT",
  "PER_MODULE",
  "BUNDLE",
  "USAGE_READY",
  "MANUAL_ENTERPRISE_CONTRACT",
  "COMPLIMENTARY",
  "IMPLEMENTATION_FEE",
  "MIGRATION_FEE",
] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_FEE_TYPES = ["IMPLEMENTATION", "MIGRATION", "SETUP", "OTHER"] as const;

export type BillingFeeType = (typeof BILLING_FEE_TYPES)[number];

export const BILLING_CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "CANCELED"] as const;

export const BILLING_ORDER_STATUSES = ["DRAFT", "OPEN", "FULFILLED", "CANCELED"] as const;

export const BILLING_INVOICE_STATUSES = ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"] as const;

export const PRICE_INTERVALS = ["MONTHLY", "ANNUAL", "ONE_TIME", "USAGE"] as const;

export const BILLING_PROVIDER_EVENT_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED_DUPLICATE",
] as const;

/** Logical model keys required by MK-S9. */
export const BILLING_LOGICAL_MODELS = [
  "billing_customer",
  "plan",
  "price",
  "subscription",
  "subscription_item",
  "invoice_metadata",
  "order",
  "order_item",
  "contract",
  "implementation_fee",
  "billing_event",
] as const;

export type BillingLogicalModel = (typeof BILLING_LOGICAL_MODELS)[number];

/**
 * Invariant: provider webhooks may only mutate commercial access by invoking
 * EntitlementsService (or subscription domain that syncs through it).
 */
export const BILLING_WEBHOOK_ENTITLEMENT_INVARIANT =
  "Provider webhooks must not write tenant_products / tenant_module_entitlements directly.";

export const billingWebhookEnvelopeSchema = z.object({
  eventId: z.string().min(1).max(255),
  eventType: z.string().min(1).max(128),
  occurredAt: z.string().datetime().optional(),
  tenantId: z.string().uuid().optional(),
  externalCustomerId: z.string().max(255).optional(),
  externalSubscriptionId: z.string().max(255).optional(),
  payload: z.record(z.unknown()).default({}),
});

export type BillingWebhookEnvelope = z.infer<typeof billingWebhookEnvelopeSchema>;

export const createBillingCustomerInputSchema = z.object({
  displayName: z.string().min(1).max(300).optional(),
  billingEmail: z.string().email().max(320).optional().nullable(),
  externalCustomerId: z.string().max(255).optional().nullable(),
  billingProvider: z.enum(BILLING_PROVIDERS).default("NONE"),
});

export const createBillingContractInputSchema = z.object({
  name: z.string().min(1).max(300),
  status: z.enum(BILLING_CONTRACT_STATUSES).default("DRAFT"),
  billingType: z.enum(BILLING_TYPES).default("MANUAL_ENTERPRISE_CONTRACT"),
  startsOn: z.string().date().optional().nullable(),
  endsOn: z.string().date().optional().nullable(),
  renewalOn: z.string().date().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  setupFeeCents: z.number().int().nonnegative().optional().nullable(),
  pricingJson: z
    .object({
      overrideAmountCents: z.number().int().nonnegative().optional(),
      currency: z.string().length(3).optional(),
      modules: z
        .array(
          z.object({
            moduleCode: z.string().min(1).max(64),
            amountCents: z.number().int().nonnegative(),
          }),
        )
        .max(50)
        .optional(),
    })
    .optional()
    .nullable(),
});

export const patchBillingContractInputSchema = createBillingContractInputSchema.partial();

export const patchBillingCustomerInputSchema = z.object({
  displayName: z.string().min(1).max(300).optional(),
  billingEmail: z.string().email().max(320).optional().nullable(),
  externalCustomerId: z.string().max(255).optional().nullable(),
});

export const createBillingFeeInputSchema = z.object({
  feeType: z.enum(BILLING_FEE_TYPES),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("USD"),
  description: z.string().max(500).optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
});

export const PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export const createSubscriptionPlanInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase letters, digits, and underscores"),
  name: z.string().min(1).max(200),
  billingInterval: z.enum(PRICE_INTERVALS),
  basePriceCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  status: z.enum(PLAN_STATUSES).default("ACTIVE"),
  configurationJson: z.record(z.unknown()).optional(),
});

export const patchSubscriptionPlanInputSchema = createSubscriptionPlanInputSchema
  .omit({ code: true })
  .partial();

export const createPlanPriceInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase letters, digits, and underscores"),
  nickname: z.string().min(1).max(200),
  interval: z.enum(PRICE_INTERVALS),
  amountCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  billingType: z.enum(BILLING_TYPES).default("MONTHLY"),
  status: z.enum(PLAN_STATUSES).default("ACTIVE"),
  configurationJson: z.record(z.unknown()).optional(),
});

export const patchPlanPriceInputSchema = createPlanPriceInputSchema.partial().omit({ code: true });

export const createBillingInvoiceInputSchema = z.object({
  status: z.enum(BILLING_INVOICE_STATUSES).default("OPEN"),
  currency: z.string().length(3).default("USD"),
  amountDueCents: z.number().int().nonnegative().default(0),
  amountPaidCents: z.number().int().nonnegative().default(0),
  externalInvoiceId: z.string().max(255).optional().nullable(),
  hostedInvoiceUrl: z.string().url().max(2000).optional().nullable(),
  subscriptionId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const patchBillingInvoiceInputSchema = createBillingInvoiceInputSchema.partial();
