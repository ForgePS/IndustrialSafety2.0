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

import { IndustrialMessagingService } from "./industrial-messaging.service.js";

function principal(): ForgePrincipal {
  return {
    authenticationIdentityId: "aid",
    userId: "11111111-1111-4111-8111-111111111111",
    personId: null,
    tenantId: "22222222-2222-4222-8222-222222222222",
    organizationIds: [],
    permissions: new Set(["industrial.access"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

describe("IndustrialMessagingService.markRead notifications", () => {
  let service: IndustrialMessagingService;
  let markUnreadByTypeAndThread: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    markUnreadByTypeAndThread = vi.fn(async () => 1);

    withTenantTransaction.mockImplementation(async (_db, _tid, fn, _userId?) =>
      fn({
        query: {
          industrialMessagingThreads: {
            findFirst: async () => ({
              id: "33333333-3333-4333-8333-333333333333",
              tenantId: principal().tenantId,
              threadType: "DIRECT",
            }),
          },
          industrialMessagingThreadMembers: {
            findFirst: async () => ({
              threadId: "33333333-3333-4333-8333-333333333333",
              userId: principal().userId,
              tenantId: principal().tenantId,
            }),
          },
        },
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
      }),
    );

    service = new IndustrialMessagingService(
      {} as never,
      {} as never,
      { markUnreadByTypeAndThread } as never,
    );
  });

  it("clears matching messaging notifications after updating lastReadAt", async () => {
    const threadId = "33333333-3333-4333-8333-333333333333";
    const result = await service.markRead(principal(), threadId);

    expect(result.ok).toBe(true);
    expect(result.readAt).toEqual(expect.any(String));
    expect(markUnreadByTypeAndThread).toHaveBeenCalledWith(
      principal().tenantId,
      principal().userId,
      "industrial.messaging.new_message",
      threadId,
    );
  });

  it("still returns ok when notification clear fails", async () => {
    markUnreadByTypeAndThread.mockRejectedValueOnce(new Error("db down"));
    const result = await service.markRead(principal(), "33333333-3333-4333-8333-333333333333");
    expect(result.ok).toBe(true);
  });
});
