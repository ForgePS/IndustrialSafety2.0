import { z } from "zod";
import { TENANT_STATUSES } from "./tenant-domain.js";

export const platformAnalyticsTenantCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  active: z.number().int().nonnegative(),
  trial: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative(),
});

export const platformAnalyticsUserCountsSchema = z.object({
  totalMemberships: z.number().int().nonnegative(),
  activeMemberships: z.number().int().nonnegative(),
  suspendedMemberships: z.number().int().nonnegative(),
});

export const platformAnalyticsProductCountsSchema = z.object({
  catalogActive: z.number().int().nonnegative(),
  tenantAssignmentsActive: z.number().int().nonnegative(),
});

export const platformAnalyticsModuleAdoptionSchema = z.object({
  moduleCode: z.string().min(1).max(64),
  moduleName: z.string().min(1).max(200),
  tenantCount: z.number().int().nonnegative(),
});

export const platformAnalyticsOnboardingCountsSchema = z.object({
  inProgress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const platformAnalyticsBillingCountsSchema = z.object({
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  activeLike: z.number().int().nonnegative(),
  trial: z.number().int().nonnegative(),
});

export const platformAnalyticsActivityItemSchema = z.object({
  occurredAt: z.string().datetime(),
  action: z.string().min(1).max(200),
  resourceType: z.string().min(1).max(120),
  result: z.string().min(1).max(64),
  /** Opaque tenant key (slug/key), never email or person PII. */
  tenantKey: z.string().max(100).nullable(),
});

export const platformAnalyticsOverviewSchema = z.object({
  generatedAt: z.string().datetime(),
  tenants: platformAnalyticsTenantCountsSchema,
  users: platformAnalyticsUserCountsSchema,
  products: platformAnalyticsProductCountsSchema,
  modules: z.object({
    adoption: z.array(platformAnalyticsModuleAdoptionSchema).max(50),
  }),
  onboarding: platformAnalyticsOnboardingCountsSchema,
  billing: platformAnalyticsBillingCountsSchema,
  recentActivity: z.array(platformAnalyticsActivityItemSchema).max(25),
});

export type PlatformAnalyticsOverview = z.infer<typeof platformAnalyticsOverviewSchema>;

export const PLATFORM_ANALYTICS_TENANT_STATUS_KEYS = TENANT_STATUSES;
