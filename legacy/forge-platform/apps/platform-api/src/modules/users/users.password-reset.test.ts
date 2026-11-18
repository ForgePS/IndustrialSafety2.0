import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgePrincipal } from "@forge/tenant-context";

const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

import { UsersService } from "./users.service.js";

const TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const USER_ID = "019ff7d0-aaaa-7659-81e4-c0cd68e23262";

function principal(): ForgePrincipal {
  return {
    userId: "admin-1",
    personId: "person-1",
    tenantId: TENANT_ID,
    correlationId: "corr",
    requestId: "req",
  } as ForgePrincipal;
}

describe("UsersService.sendPasswordReset", () => {
  const audit = { writeInTransaction: vi.fn() };
  const cognito = { resetPassword: vi.fn() };
  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsersService(
      {} as never,
      { write: vi.fn() } as never,
      audit as never,
      {} as never,
      cognito as never,
    );
  });

  it("refuses disabled accounts before calling Cognito", async () => {
    withTenantTransaction.mockImplementation(async (_db, _tid, fn: (tx: unknown) => unknown) =>
      fn({
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: USER_ID,
              tenantId: TENANT_ID,
              primaryEmail: "operator@example.com",
              status: "DISABLED",
              recordVersion: 1,
            }),
          },
        },
      }),
    );

    await expect(service.sendPasswordReset(TENANT_ID, USER_ID, principal())).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(cognito.resetPassword).not.toHaveBeenCalled();
  });

  it("uses the Cognito username from the invitation and audits the send", async () => {
    const user = {
      id: USER_ID,
      tenantId: TENANT_ID,
      primaryEmail: "operator@example.com",
      status: "ACTIVE",
      recordVersion: 2,
    };
    withTenantTransaction
      .mockImplementationOnce(async (_db, _tid, fn: (tx: unknown) => unknown) =>
        fn({
          query: {
            users: { findFirst: vi.fn().mockResolvedValue(user) },
          },
        }),
      )
      .mockImplementationOnce(async (_db, _tid, fn: (tx: unknown) => unknown) =>
        fn({
          query: {
            userInvitations: {
              findFirst: vi.fn().mockResolvedValue({ cognitoUsername: "operator@example.com" }),
            },
          },
        }),
      )
      .mockImplementationOnce(async (_db, _tid, fn: (tx: unknown) => unknown) => fn({}));

    cognito.resetPassword.mockResolvedValue({ method: "reset" });

    await expect(service.sendPasswordReset(TENANT_ID, USER_ID, principal())).resolves.toEqual({
      userId: USER_ID,
      email: "operator@example.com",
      method: "reset",
      delivered: true,
    });
    expect(cognito.resetPassword).toHaveBeenCalledWith("operator@example.com");
    expect(audit.writeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.password_reset.requested",
        resourceId: USER_ID,
        after: { method: "reset", email: "operator@example.com" },
      }),
    );
  });
});
