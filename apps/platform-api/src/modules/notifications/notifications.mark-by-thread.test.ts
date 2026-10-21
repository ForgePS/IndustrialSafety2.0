import { beforeEach, describe, expect, it, vi } from "vitest";

const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

vi.mock("./email-provider.js", () => ({
  createEmailProviderFromEnv: () => ({ name: "noop", send: vi.fn() }),
  renderTemplate: (s: string) => s,
}));

import { NotificationsService } from "./notifications.service.js";

describe("NotificationsService.markUnreadByTypeAndThread", () => {
  let service: NotificationsService;
  let updatedWhere: unknown;
  let setPatch: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    updatedWhere = undefined;
    setPatch = null;

    withTenantTransaction.mockImplementation(async (_db, _tid, fn) =>
      fn({
        update: () => ({
          set: (patch: Record<string, unknown>) => {
            setPatch = patch;
            return {
              where: (clause: unknown) => {
                updatedWhere = clause;
                return {
                  returning: async () => [{ id: "n1" }, { id: "n2" }],
                };
              },
            };
          },
        }),
      }),
    );

    service = new NotificationsService({} as never, {
      sendToUser: async () => ({ sent: 0, failed: 0 }),
      isEnabled: () => false,
      getPublicKey: () => ({ enabled: false, publicKey: null }),
    } as never);
  });

  it("marks unread rows matching type and threadId metadata", async () => {
    const count = await service.markUnreadByTypeAndThread(
      "tenant-1",
      "user-1",
      "industrial.messaging.new_message",
      "thread-abc",
    );

    expect(count).toBe(2);
    expect(withTenantTransaction).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-1",
      expect.any(Function),
    );
    expect(setPatch).toEqual(
      expect.objectContaining({
        readAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(updatedWhere).toBeDefined();
  });

  it("returns 0 without querying when type or threadId is blank", async () => {
    expect(await service.markUnreadByTypeAndThread("t", "u", "  ", "thread-1")).toBe(0);
    expect(await service.markUnreadByTypeAndThread("t", "u", "type", "  ")).toBe(0);
    expect(withTenantTransaction).not.toHaveBeenCalled();
  });
});
