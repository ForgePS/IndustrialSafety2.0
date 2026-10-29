import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HELPDESK_CUSTOMER_PERMISSIONS, HELPDESK_SUPPORT_PERMISSIONS } from "@forge/contracts";
import type { ForgePrincipal } from "@forge/tenant-context";
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from "../auth-context/require-permission.decorator.js";
import { HelpdeskController } from "./helpdesk.controller.js";

let selectRows: unknown[] = [];

/** Minimal drizzle-style chain: every builder call returns the chain; awaiting yields selectRows. */
function chain(): unknown {
  const target = {
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(selectRows).then(resolve, reject),
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === "then") return obj.then;
      return () => chain();
    },
  });
}

const txMock = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
  delete: () => chain(),
  execute: async () => [],
  query: {},
};

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    withTenantTransaction: async (
      _db: unknown,
      _tenantId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(txMock),
    withBypassRlsTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(txMock),
  };
});

const { HelpdeskService } = await import("./helpdesk.service.js");

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TICKET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function principal(
  perms: readonly string[],
  overrides: Partial<ForgePrincipal> = {},
): ForgePrincipal {
  return {
    authenticationIdentityId: "auth-1",
    userId: USER_A,
    personId: null,
    tenantId: TENANT_A,
    organizationIds: [],
    permissions: new Set(perms),
    activeProducts: new Set(["FORGE_INDUSTRIAL"]),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
    ...overrides,
  };
}

const CUSTOMER = principal([
  "helpdesk.ticket.create",
  "helpdesk.ticket.view_own",
  "helpdesk.ticket.comment",
  "helpdesk.ticket.reopen",
  "helpdesk.ticket.close",
]);

function service() {
  const audit = { writeInTransaction: vi.fn(async () => "audit-id") };
  const storage = {};
  const notifications = { create: vi.fn() };
  return new HelpdeskService({} as never, audit as never, storage as never, notifications as never);
}

function meta(method: keyof HelpdeskController): RequirePermissionMeta {
  const handler = HelpdeskController.prototype[method] as unknown as object;
  return Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler) as RequirePermissionMeta;
}

describe("helpdesk route permissions", () => {
  const methods = Object.getOwnPropertyNames(HelpdeskController.prototype).filter(
    (m) => m !== "constructor",
  ) as Array<keyof HelpdeskController>;

  it("guards every route with a permission", () => {
    for (const m of methods) {
      const required = meta(m);
      expect(required?.anyOf?.length ?? (required?.permissionCode ? 1 : 0), m).toBeGreaterThan(0);
    }
  });

  it("never lets customer permissions satisfy a support console route", () => {
    const supportRoutes = methods.filter((m) => m.startsWith("support"));
    expect(supportRoutes.length).toBeGreaterThan(10);
    for (const m of supportRoutes) {
      const allowed = meta(m).anyOf ?? [];
      for (const code of allowed) {
        expect(
          HELPDESK_CUSTOMER_PERMISSIONS as readonly string[],
          `${m} accepts ${code}`,
        ).not.toContain(code);
        expect(HELPDESK_SUPPORT_PERMISSIONS as readonly string[]).toContain(code);
      }
    }
  });
});

describe("helpdesk service authorization", () => {
  beforeEach(() => {
    selectRows = [];
  });

  it("blocks customers from every support console action", async () => {
    const svc = service();
    await expect(svc.supportSummary(CUSTOMER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.supportList(CUSTOMER, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.supportTicketDetail(CUSTOMER, TICKET)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(svc.supportReply(CUSTOMER, TICKET, { body: "hi" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      svc.supportInternalNote(CUSTOMER, TICKET, { body: "secret" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      svc.supportAssign(CUSTOMER, TICKET, { assigneeUserId: null }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      svc.supportChangeStatus(CUSTOMER, TICKET, { status: "RESOLVED" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(svc.supportAgents(CUSTOMER)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks ticket creation without helpdesk.ticket.create", async () => {
    const svc = service();
    await expect(
      svc.createTicket(principal(["helpdesk.ticket.view_own"]), {
        requestType: "OTHER",
        subject: "Cannot log in",
        description: "Login page says my account is locked.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides another user's ticket from a customer without company-wide access", async () => {
    selectRows = [
      { id: TICKET, tenantId: TENANT_A, requesterUserId: USER_B, status: "NEW", recordVersion: 1 },
    ];
    const svc = service();
    await expect(svc.getMyTicket(CUSTOMER, TICKET)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.customerReply(CUSTOMER, TICKET, { body: "hello" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      svc.attachmentDownload(CUSTOMER, "customer", TICKET, TICKET),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not let a customer use support mode for attachments", async () => {
    const svc = service();
    await expect(svc.attachmentDownload(CUSTOMER, "support", TICKET, TICKET)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    await expect(
      svc.createAttachmentUpload(CUSTOMER, "support", TICKET, {
        filename: "a.png",
        mimeType: "image/png",
        contentLength: 10,
        internal: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects disallowed attachment types before touching storage", async () => {
    const svc = service();
    await expect(
      svc.createAttachmentUpload(CUSTOMER, "customer", TICKET, {
        filename: "run.exe",
        mimeType: "application/x-msdownload",
        contentLength: 10,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("does not allow a customer to reply on a closed ticket", async () => {
    selectRows = [
      {
        id: TICKET,
        tenantId: TENANT_A,
        requesterUserId: USER_A,
        status: "CLOSED",
        recordVersion: 1,
      },
    ];
    const svc = service();
    await expect(svc.customerReply(CUSTOMER, TICKET, { body: "hello" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
