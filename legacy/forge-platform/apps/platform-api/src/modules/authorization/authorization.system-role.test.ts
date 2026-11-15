import { beforeEach, describe, expect, it, vi } from "vitest";

const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

import type { ForgePrincipal } from "@forge/tenant-context";
import { AuthorizationService } from "./authorization.service.js";

function principal(): ForgePrincipal {
  return {
    authenticationIdentityId: "a",
    userId: "user-1",
    personId: "person-1",
    tenantId: "tenant-1",
    organizationIds: [],
    permissions: new Set(["platform.role.assign"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

describe("AuthorizationService system-managed roles", () => {
  const service = new AuthorizationService(
    {} as never,
    { write: vi.fn() } as never,
    { writeInTransaction: vi.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    withTenantTransaction.mockReset();
  });

  it("refuses patchRole when role is system-managed", async () => {
    withTenantTransaction.mockImplementation(async (_db, _tenantId, fn) =>
      fn({
        query: {
          roles: {
            findFirst: async () => ({
              id: "role-1",
              isSystemManaged: true,
              recordVersion: 1,
              name: "Tenant Admin",
            }),
          },
        },
      }),
    );

    await expect(
      service.patchRole("tenant-1", "role-1", { name: "Hacked" }, principal(), "*"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses setRolePermissions when role is system-managed", async () => {
    withTenantTransaction.mockImplementation(async (_db, _tenantId, fn) =>
      fn({
        query: {
          roles: {
            findFirst: async () => ({
              id: "role-1",
              isSystemManaged: true,
              recordVersion: 1,
            }),
          },
        },
      }),
    );

    await expect(
      service.setRolePermissions(
        "tenant-1",
        "role-1",
        { permissionCodes: ["platform.person.read"] },
        principal(),
        "*",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
