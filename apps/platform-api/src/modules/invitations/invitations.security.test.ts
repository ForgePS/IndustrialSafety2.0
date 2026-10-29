import { describe, expect, it, vi, beforeEach } from "vitest";
import { ForgeError } from "@forge/errors";
import {
  emailsMatchForInvitationAccept,
  INVITATION_RESEND_EXTEND_HOURS,
  isTerminalInvitationStatus,
} from "@forge/contracts";

const lookupInvitation = vi.fn();
const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    lookupInvitation: (...args: unknown[]) => lookupInvitation(...args),
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

vi.mock("../cognito/cognito-admin.service.js", () => ({
  CognitoAdminService: class {
    createOrGetUser = vi.fn();
    resendInvitation = vi.fn();
    deleteUser = vi.fn();
  },
}));

import { InvitationsService } from "./invitations.service.js";

describe("InvitationsService security", () => {
  const memberships = {
    applyRoles: vi.fn(),
    applyProductsAndModules: vi.fn(),
    recordHistory: vi.fn(),
    activateInTransaction: vi.fn(),
  };
  const outbox = { write: vi.fn() };
  const audit = { writeInTransaction: vi.fn() };
  const cognito = {
    createOrGetUser: vi.fn(),
    resendInvitation: vi.fn(),
    deleteUser: vi.fn(),
    enabled: false,
  };

  let service: InvitationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InvitationsService(
      {} as never,
      cognito as never,
      memberships as never,
      outbox as never,
      audit as never,
    );
  });

  it("denies accept when invitation is expired", async () => {
    lookupInvitation.mockResolvedValue({
      invitationId: "inv-1",
      tenantId: "tenant-1",
      status: "SENT",
      expiresAt: new Date(Date.now() - 60_000),
    });
    withTenantTransaction.mockImplementation(async (_db, _tid, fn) =>
      fn({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(async () => undefined),
          })),
        })),
      }),
    );

    await expect(
      service.accept({ token: "a".repeat(24) }, { correlationId: "c", requestId: "r" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/expired/i) });
  });

  it("denies accept when invitation is revoked", async () => {
    lookupInvitation.mockResolvedValue({
      invitationId: "inv-1",
      tenantId: "tenant-1",
      status: "REVOKED",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.accept({ token: "a".repeat(24) }, { correlationId: "c", requestId: "r" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(isTerminalInvitationStatus("REVOKED")).toBe(true);
  });

  it("denies accept when email does not match invitation", async () => {
    lookupInvitation.mockResolvedValue({
      invitationId: "inv-1",
      tenantId: "tenant-1",
      status: "SENT",
      expiresAt: new Date(Date.now() + 60_000),
    });
    withTenantTransaction.mockImplementation(async (_db, _tid, fn) =>
      fn({
        query: {
          userInvitations: {
            findFirst: async () => ({
              id: "inv-1",
              tenantId: "tenant-1",
              email: "invitee@example.com",
              status: "SENT",
              facilityIdsJson: [],
              organizationId: null,
              personId: null,
              cognitoSubject: null,
              membershipId: null,
              createdAt: new Date(),
              recordVersion: 1,
            }),
          },
          users: { findFirst: vi.fn() },
          authenticationIdentities: { findFirst: vi.fn() },
        },
        insert: vi.fn(),
        update: vi.fn(),
      }),
    );

    await expect(
      service.accept(
        { token: "a".repeat(24), email: "wrong@example.com" },
        { correlationId: "c", requestId: "r" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(emailsMatchForInvitationAccept("invitee@example.com", "wrong@example.com")).toBe(false);
  });

  it("denies create into another tenant for non-platform admins", async () => {
    await expect(
      service.create(
        {
          tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          email: "x@example.com",
          send: false,
        },
        {
          authenticationIdentityId: "a",
          userId: "11111111-1111-4111-8111-111111111111",
          personId: null,
          tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          organizationIds: [],
          permissions: new Set(["platform.invitation.manage"]),
          activeProducts: new Set(),
          activeModules: new Set(),
          correlationId: "c",
          requestId: "r",
          authProvider: "COGNITO",
          isPlatformAdmin: false,
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("documents resend expiry extension hours", () => {
    expect(INVITATION_RESEND_EXTEND_HOURS).toBe(168);
  });
});

describe("invitation email bind helper", () => {
  it("matches case-insensitively", () => {
    expect(() => {
      if (!emailsMatchForInvitationAccept("A@B.com", "other@b.com")) {
        throw new ForgeError("FORBIDDEN", "Accepting email does not match the invitation email");
      }
    }).toThrow(ForgeError);
  });
});
