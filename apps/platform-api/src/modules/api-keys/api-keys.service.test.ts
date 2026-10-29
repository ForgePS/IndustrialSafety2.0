import { describe, expect, it, vi, beforeEach } from "vitest";
import { API_KEY_PREFIX } from "@forge/contracts";
import { hashOpaqueSecret, redactSensitive } from "@forge/security";

const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    createId: () => "11111111-1111-4111-8111-111111111111",
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

import { ApiKeysService } from "./api-keys.service.js";

const principal = {
  userId: "user-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
} as never;

describe("ApiKeysService (MK-S15)", () => {
  let service: ApiKeysService;
  let inserted: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    inserted = null;
    service = new ApiKeysService(
      {} as never,
      {
        writeInTransaction: vi.fn(async () => "audit-1"),
      } as never,
    );
    withTenantTransaction.mockImplementation(async (_db, _tid, fn) =>
      fn({
        insert: () => ({
          values: (v: Record<string, unknown>) => ({
            returning: async () => {
              inserted = v;
              return [
                {
                  ...v,
                  lastUsedAt: null,
                  revokedAt: null,
                },
              ];
            },
          }),
        }),
        query: {
          tenantApiKeys: {
            findMany: async () => (inserted ? [inserted] : []),
            findFirst: async () => inserted,
          },
        },
        update: () => ({
          set: (patch: Record<string, unknown>) => ({
            where: () => ({
              returning: async () => [{ ...inserted, ...patch }],
            }),
          }),
        }),
      }),
    );
  });

  it("create returns raw key once and persists hash only", async () => {
    const created = await service.create(
      "tenant-1",
      { name: "CI", scopes: ["tenant.read"] },
      principal,
    );

    expect(created.apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(inserted?.keyHash).toBe(hashOpaqueSecret(created.apiKey));
    expect(JSON.stringify(inserted)).not.toContain(created.apiKey);
    expect(redactSensitive({ apiKey: created.apiKey }).apiKey).toBe("[REDACTED]");
  });

  it("denies cross-tenant create", async () => {
    await expect(
      service.create("tenant-other", { name: "x", scopes: ["a"] }, principal),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("revoke sets revokedAt", async () => {
    await service.create("tenant-1", { name: "CI", scopes: ["tenant.read"] }, principal);
    const revoked = await service.revoke(
      "tenant-1",
      "11111111-1111-4111-8111-111111111111",
      principal,
    );
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });
});
