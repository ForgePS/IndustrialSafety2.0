import { describe, expect, it } from "vitest";
import { SearchService } from "./search.service.js";

function principal(perms: string[]) {
  return {
    isPlatformAdmin: false,
    permissions: new Set(perms),
    activeProducts: new Set(),
    activeModules: new Set(),
    tenantId: "tenant-1",
    userId: "u1",
    personId: null,
    organizationIds: [],
    authenticationIdentityId: "a",
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
  } as never;
}

describe("SearchService (MK-S18)", () => {
  it("rejects tenant scope mismatch for non-platform admins", async () => {
    const service = new SearchService({} as never);
    await expect(
      service.search(
        "other-tenant",
        { q: "acme", types: ["tenant"] },
        principal(["platform.tenant.read"]),
      ),
    ).rejects.toThrow(/Tenant scope mismatch/);
  });

  it("omits tenant group when principal lacks platform.tenant.read", async () => {
    const service = new SearchService({} as never);
    const result = await service.search(
      "tenant-1",
      { q: "acme", types: ["tenant"] },
      principal(["platform.membership.read"]),
    );
    expect(result.groups).toEqual([]);
  });

  it("returns tenant hits for platform.tenant.read after authz", async () => {
    const service = new SearchService({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "11111111-1111-4111-8111-111111111111",
                displayName: "Acme",
                slug: "acme",
                status: "ACTIVE",
              },
            ],
          }),
        }),
      }),
    } as never);

    const result = await service.search(
      "tenant-1",
      { q: "acme", types: ["tenant"] },
      principal(["platform.tenant.read"]),
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.hits[0]?.title).toBe("Acme");
    expect(result.groups[0]?.hits[0]?.href).toContain("tenant-detail");
  });
});
