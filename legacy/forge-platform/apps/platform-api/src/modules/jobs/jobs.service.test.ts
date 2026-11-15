import { describe, expect, it } from "vitest";
import { JobsService } from "./jobs.service.js";

function principal(perms: string[], tenantId = "tenant-1") {
  return {
    isPlatformAdmin: false,
    permissions: new Set(perms),
    activeProducts: new Set(),
    activeModules: new Set(),
    tenantId,
    userId: "u1",
    personId: null,
    organizationIds: [],
    authenticationIdentityId: "a",
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
  } as never;
}

describe("JobsService (MK-S19)", () => {
  it("rejects tenant scope mismatch", async () => {
    const service = new JobsService({} as never);
    await expect(service.list("other", {}, principal(["platform.jobs.read"]))).rejects.toThrow(
      /Tenant scope mismatch/,
    );
  });

  it("maps persisted job row to public contract", () => {
    const service = new JobsService({} as never);
    const publicJob = service.toPublic({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      type: "export.memberships.csv",
      status: "SUCCEEDED",
      progress: 100,
      attempt: 1,
      createdByUserId: null,
      correlationId: "corr",
      requestId: "req",
      startedAt: new Date("2026-08-11T00:00:00.000Z"),
      completedAt: new Date("2026-08-11T00:01:00.000Z"),
      failure: null,
      resultJson: { kind: "memberships.csv", rowCount: 2 },
      artifactObjectKey: null,
      artifactContentType: "text/csv",
      artifactFilename: "m.csv",
      artifactInline: "a,b\n1,2",
      artifactExpiresAt: null,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:01:00.000Z"),
    });
    expect(publicJob.downloadAvailable).toBe(true);
    expect(publicJob.resultSummary?.hasInlineArtifact).toBe(true);
    expect(publicJob.resultSummary?.kind).toBe("memberships.csv");
  });
});
