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

function tenantAdminPrincipal(): ForgePrincipal {
  return {
    authenticationIdentityId: "a",
    userId: "user-1",
    personId: "person-1",
    tenantId: "tenant-1",
    organizationIds: [],
    permissions: new Set(["platform.role.assign", "platform.person.read"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

describe("AuthorizationService privilege escalation (MK-S21)", () => {
  const service = new AuthorizationService(
    {} as never,
    { write: vi.fn() } as never,
    { writeInTransaction: vi.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    withTenantTransaction.mockReset();
  });

  it("refuses setRolePermissions that add creator-only permissions", async () => {
    withTenantTransaction.mockImplementation(async (_db, _tenantId, fn) =>
      fn({
        query: {
          roles: {
            findFirst: async () => ({
              id: "role-1",
              isSystemManaged: false,
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
        {
          permissionCodes: [
            "platform.person.read",
            "platform.tenant.create",
            "platform.tenant.suspend",
            "platform.entitlement.manage",
          ],
        },
        tenantAdminPrincipal(),
        "*",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses setRolePermissions for permissions the caller does not hold", async () => {
    withTenantTransaction.mockImplementation(async (_db, _tenantId, fn) =>
      fn({
        query: {
          roles: {
            findFirst: async () => ({
              id: "role-1",
              isSystemManaged: false,
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
        { permissionCodes: ["platform.audit.export"] },
        tenantAdminPrincipal(),
        "*",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
