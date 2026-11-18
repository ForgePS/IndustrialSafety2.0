import { describe, expect, it } from "vitest";
import { platformAnalyticsOverviewSchema } from "./platform-analytics-domain.js";

describe("platform-analytics-domain (MK-S20)", () => {
  it("accepts aggregate-only overview payload", () => {
    const parsed = platformAnalyticsOverviewSchema.parse({
      generatedAt: "2026-08-11T08:00:00.000Z",
      tenants: {
        total: 3,
        byStatus: { ACTIVE: 2, TRIAL: 1 },
        active: 2,
        trial: 1,
        suspended: 0,
      },
      users: { totalMemberships: 10, activeMemberships: 8, suspendedMemberships: 1 },
      products: { catalogActive: 4, tenantAssignmentsActive: 5 },
      modules: { adoption: [{ moduleCode: "LOTO", moduleName: "LOTO", tenantCount: 2 }] },
      onboarding: { inProgress: 1, completed: 2, failed: 0, total: 3 },
      billing: { byStatus: { ACTIVE: 2, TRIAL: 1 }, activeLike: 3, trial: 1 },
      recentActivity: [
        {
          occurredAt: "2026-08-11T07:00:00.000Z",
          action: "tenant.create",
          resourceType: "tenant",
          result: "SUCCESS",
          tenantKey: "acme",
        },
      ],
    });
    expect(parsed.tenants.active).toBe(2);
    expect(parsed.recentActivity[0]?.tenantKey).toBe("acme");
  });
});
