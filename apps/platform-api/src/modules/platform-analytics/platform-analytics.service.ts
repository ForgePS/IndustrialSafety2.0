import { Inject, Injectable } from "@nestjs/common";
import { type PlatformAnalyticsOverview, platformAnalyticsOverviewSchema } from "@forge/contracts";
import {
  auditEvents,
  customerOnboardingSessions,
  platformModules,
  platformProducts,
  subscriptions,
  tenantModuleEntitlements,
  tenantProducts,
  tenants,
  userTenantMemberships,
  withBypassRlsTransaction,
  type Database,
} from "@forge/database";
import { count, desc, eq, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

const ACTIVE_LIKE_SUB_STATUSES = new Set(["ACTIVE", "TRIAL", "GRACE", "GRACE_PERIOD"]);

@Injectable()
export class PlatformAnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async overview(): Promise<PlatformAnalyticsOverview> {
    return withBypassRlsTransaction(this.db, async (tx) => {
      const tenantRows = await tx
        .select({ status: tenants.status, value: count() })
        .from(tenants)
        .groupBy(tenants.status);

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of tenantRows) {
        const n = Number(row.value) || 0;
        byStatus[row.status] = n;
        total += n;
      }

      const membershipRows = await tx
        .select({ status: userTenantMemberships.status, value: count() })
        .from(userTenantMemberships)
        .groupBy(userTenantMemberships.status);

      let totalMemberships = 0;
      let activeMemberships = 0;
      let suspendedMemberships = 0;
      for (const row of membershipRows) {
        const n = Number(row.value) || 0;
        totalMemberships += n;
        if (row.status === "ACTIVE") activeMemberships += n;
        if (row.status === "SUSPENDED") suspendedMemberships += n;
      }

      const [catalogActiveRow] = await tx
        .select({ value: count() })
        .from(platformProducts)
        .where(eq(platformProducts.status, "ACTIVE"));

      const [tenantAssignmentsRow] = await tx
        .select({ value: count() })
        .from(tenantProducts)
        .where(eq(tenantProducts.status, "ACTIVE"));

      const adoptionRows = await tx
        .select({
          moduleCode: platformModules.code,
          moduleName: platformModules.name,
          tenantCount: sql<number>`count(distinct ${tenantModuleEntitlements.tenantId})::int`,
        })
        .from(tenantModuleEntitlements)
        .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
        .where(eq(tenantModuleEntitlements.status, "ACTIVE"))
        .groupBy(platformModules.code, platformModules.name)
        .orderBy(sql`count(distinct ${tenantModuleEntitlements.tenantId}) desc`)
        .limit(25);

      const onboardingRows = await tx
        .select({ status: customerOnboardingSessions.status, value: count() })
        .from(customerOnboardingSessions)
        .groupBy(customerOnboardingSessions.status);

      let onboardingTotal = 0;
      let inProgress = 0;
      let completed = 0;
      let failed = 0;
      for (const row of onboardingRows) {
        const n = Number(row.value) || 0;
        onboardingTotal += n;
        if (row.status === "IN_PROGRESS") inProgress += n;
        else if (row.status === "COMPLETED") completed += n;
        else if (row.status === "FAILED" || row.status === "CANCELLED") failed += n;
      }

      const subRows = await tx
        .select({ status: subscriptions.status, value: count() })
        .from(subscriptions)
        .groupBy(subscriptions.status);

      const billingByStatus: Record<string, number> = {};
      let activeLike = 0;
      let trial = 0;
      for (const row of subRows) {
        const n = Number(row.value) || 0;
        billingByStatus[row.status] = n;
        if (ACTIVE_LIKE_SUB_STATUSES.has(row.status)) activeLike += n;
        if (row.status === "TRIAL") trial += n;
      }

      const activityRows = await tx
        .select({
          occurredAt: auditEvents.occurredAt,
          action: auditEvents.action,
          resourceType: auditEvents.resourceType,
          result: auditEvents.result,
          tenantKey: tenants.tenantKey,
        })
        .from(auditEvents)
        .leftJoin(tenants, eq(tenants.id, auditEvents.tenantId))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(15);

      const payload = {
        generatedAt: new Date().toISOString(),
        tenants: {
          total,
          byStatus,
          active: byStatus.ACTIVE ?? 0,
          trial: byStatus.TRIAL ?? 0,
          suspended: byStatus.SUSPENDED ?? 0,
        },
        users: {
          totalMemberships,
          activeMemberships,
          suspendedMemberships,
        },
        products: {
          catalogActive: Number(catalogActiveRow?.value) || 0,
          tenantAssignmentsActive: Number(tenantAssignmentsRow?.value) || 0,
        },
        modules: {
          adoption: adoptionRows.map((row) => ({
            moduleCode: row.moduleCode,
            moduleName: row.moduleName,
            tenantCount: Number(row.tenantCount) || 0,
          })),
        },
        onboarding: {
          inProgress,
          completed,
          failed,
          total: onboardingTotal,
        },
        billing: {
          byStatus: billingByStatus,
          activeLike,
          trial,
        },
        recentActivity: activityRows.map((row) => ({
          occurredAt: row.occurredAt.toISOString(),
          action: row.action,
          resourceType: row.resourceType,
          result: row.result,
          tenantKey: row.tenantKey ?? null,
        })),
      };

      return platformAnalyticsOverviewSchema.parse(payload);
    });
  }
}
