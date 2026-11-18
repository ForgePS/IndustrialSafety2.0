import { describe, expect, it } from "vitest";
import {
  allowedHelpdeskTransitions,
  canTransitionHelpdeskStatus,
  formatHelpdeskTicketNumber,
  isAllowedHelpdeskAttachmentMime,
} from "@forge/contracts";
import {
  buildCustomerTicketView,
  createTicketSchema,
  sanitizeTechnicalContext,
  slugifyTag,
  toCustomerTicket,
  type AttachmentRow,
  type EventRow,
  type MessageRow,
  type TicketRow,
} from "./helpdesk.rules.js";

const now = new Date("2026-10-08T12:00:00Z");

function ticket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: "t1",
    tenantId: "tenant-a",
    productCode: "FORGE_INDUSTRIAL",
    moduleCode: null,
    ticketNumber: "SUP-2026-000001",
    requesterUserId: "u1",
    requesterName: "Casey Customer",
    requesterEmail: "casey@example.com",
    requestType: "TECHNICAL_ISSUE",
    productArea: "INSPECTIONS",
    subject: "Inspection will not submit",
    description: "Submit button spins forever on mobile.",
    customerReportedSeverity: "P2_HIGH",
    priority: "P2_HIGH",
    status: "IN_PROGRESS",
    disposition: "BUG_CONFIRMED",
    assignedTeam: "Tier 2",
    assignedUserId: "agent-1",
    assignedUserName: "Sam Support",
    source: "WEB",
    locationId: null,
    divisionId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    technicalContext: { browser: "Chrome" },
    askForgeContext: null,
    mergedIntoTicketId: null,
    firstResponseAt: null,
    lastCustomerActivityAt: now,
    lastSupportActivityAt: null,
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    createdAt: now,
    updatedAt: now,
    recordVersion: 3,
    ...overrides,
  };
}

function message(id: string, messageType: string, isInternal: boolean): MessageRow {
  return {
    id,
    ticketId: "t1",
    authorUserId: "x",
    authorName: "X",
    authorType: messageType === "CUSTOMER_MESSAGE" ? "CUSTOMER" : "SUPPORT",
    messageType,
    body: `body ${id}`,
    isInternal,
    createdAt: now,
  };
}

function attachment(id: string, isInternal: boolean, status = "COMPLETE"): AttachmentRow {
  return {
    id,
    ticketId: "t1",
    messageId: null,
    documentId: `doc-${id}`,
    originalFilename: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 100,
    isInternal,
    status,
    uploadedByUserId: "x",
    uploadedByName: "X",
    uploadedByType: "SUPPORT",
    uploadedAt: now,
    createdAt: now,
  };
}

function event(id: string, eventType: string, isInternal: boolean): EventRow {
  return {
    id,
    ticketId: "t1",
    eventType,
    fromValue: null,
    toValue: null,
    isInternal,
    actorUserId: null,
    actorName: "X",
    actorType: "SUPPORT",
    createdAt: now,
  };
}

describe("helpdesk status workflow", () => {
  it("never lets anyone move a ticket back to NEW", () => {
    for (const from of ["TRIAGE", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const) {
      expect(allowedHelpdeskTransitions(from, "SUPPORT")).not.toContain("NEW");
      expect(allowedHelpdeskTransitions(from, "CUSTOMER")).not.toContain("NEW");
    }
  });

  it("requires support to resolve before closing", () => {
    expect(canTransitionHelpdeskStatus("IN_PROGRESS", "CLOSED", "SUPPORT")).toBe(false);
    expect(canTransitionHelpdeskStatus("IN_PROGRESS", "RESOLVED", "SUPPORT")).toBe(true);
    expect(canTransitionHelpdeskStatus("RESOLVED", "CLOSED", "SUPPORT")).toBe(true);
  });

  it("only reopens resolved or closed tickets", () => {
    expect(canTransitionHelpdeskStatus("IN_PROGRESS", "REOPENED", "SUPPORT")).toBe(false);
    expect(canTransitionHelpdeskStatus("RESOLVED", "REOPENED", "CUSTOMER")).toBe(true);
    expect(canTransitionHelpdeskStatus("CLOSED", "REOPENED", "CUSTOMER")).toBe(true);
  });

  it("limits customers to closing or reopening", () => {
    expect(allowedHelpdeskTransitions("NEW", "CUSTOMER")).toEqual(["CLOSED"]);
    expect(canTransitionHelpdeskStatus("NEW", "IN_PROGRESS", "CUSTOMER")).toBe(false);
    expect(canTransitionHelpdeskStatus("WAITING_ON_CUSTOMER", "RESOLVED", "CUSTOMER")).toBe(false);
  });

  it("lets support pause on the customer or on Forge", () => {
    expect(canTransitionHelpdeskStatus("IN_PROGRESS", "WAITING_ON_CUSTOMER", "SUPPORT")).toBe(true);
    expect(canTransitionHelpdeskStatus("WAITING_ON_CUSTOMER", "WAITING_ON_FORGE", "SUPPORT")).toBe(
      true,
    );
    expect(allowedHelpdeskTransitions("TRIAGE", "SUPPORT")).not.toContain("TRIAGE");
  });
});

describe("helpdesk ticket numbers", () => {
  it("formats SUP-YYYY-######", () => {
    expect(formatHelpdeskTicketNumber(2026, 1)).toBe("SUP-2026-000001");
    expect(formatHelpdeskTicketNumber(2027, 123456)).toBe("SUP-2027-123456");
  });
});

describe("customer ticket view", () => {
  const view = buildCustomerTicketView({
    ticket: ticket(),
    messages: [
      message("m1", "CUSTOMER_MESSAGE", false),
      message("m2", "INTERNAL_NOTE", true),
      message("m3", "SUPPORT_REPLY", false),
      message("m4", "AI_DRAFT", true),
      message("m5", "SYSTEM_EVENT", false),
    ],
    attachments: [
      attachment("a1", false),
      attachment("a2", true),
      attachment("a3", false, "PENDING"),
    ],
    events: [
      event("e1", "CREATED", false),
      event("e2", "ASSIGNED", true),
      event("e3", "STATUS_CHANGED", false),
    ],
  });

  it("never includes internal notes or AI drafts", () => {
    expect(view.messages.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(JSON.stringify(view)).not.toContain("body m2");
    expect(JSON.stringify(view)).not.toContain("body m4");
  });

  it("drops internal and unfinished attachments", () => {
    expect(view.attachments.map((a) => a.id)).toEqual(["a1"]);
  });

  it("drops internal timeline events", () => {
    expect(view.events.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("hides assignee identity, disposition, and technical context", () => {
    const t = toCustomerTicket(ticket()) as Record<string, unknown>;
    expect(t.isAssigned).toBe(true);
    for (const key of [
      "assignedUserId",
      "assignedUserName",
      "assignedTeam",
      "disposition",
      "technicalContext",
      "tenantId",
    ]) {
      expect(t).not.toHaveProperty(key);
    }
    expect(JSON.stringify(view)).not.toContain("Sam Support");
  });
});

describe("technical context capture", () => {
  it("keeps allow-listed fields and drops secrets", () => {
    const out = sanitizeTechnicalContext({
      browser: "Chrome",
      browserVersion: "129",
      viewportWidth: 390,
      isMobile: true,
      url: "https://app.example.com/modules/inspections/?id=1&token=abc",
      route: "/modules/inspections/?code=xyz",
      accessToken: "secret-value",
      authorization: "Bearer abc",
      localStorage: { a: 1 },
      lastErrorId: "session=abcd",
    });
    expect(out).toEqual({
      browser: "Chrome",
      browserVersion: "129",
      viewportWidth: 390,
      isMobile: true,
      url: "https://app.example.com/modules/inspections/",
      route: "/modules/inspections/",
    });
  });

  it("ignores non-object input", () => {
    expect(sanitizeTechnicalContext(null)).toEqual({});
    expect(sanitizeTechnicalContext(["x"])).toEqual({});
  });
});

describe("ticket input validation", () => {
  it("requires a meaningful subject and description", () => {
    expect(() =>
      createTicketSchema.parse({ requestType: "OTHER", subject: "hi", description: "help" }),
    ).toThrow();
    const ok = createTicketSchema.parse({
      requestType: "OTHER",
      subject: "Cannot log in",
      description: "Login page says my account is locked.",
    });
    expect(ok.productCode).toBe("FORGE_INDUSTRIAL");
    expect(ok.source).toBe("WEB");
  });

  it("rejects unknown priorities", () => {
    expect(() =>
      createTicketSchema.parse({
        requestType: "OTHER",
        subject: "Cannot log in",
        description: "Login page says my account is locked.",
        customerReportedSeverity: "URGENT",
      }),
    ).toThrow();
  });
});

describe("attachments and tags", () => {
  it("allows documented file types only", () => {
    expect(isAllowedHelpdeskAttachmentMime("image/png")).toBe(true);
    expect(isAllowedHelpdeskAttachmentMime("text/csv")).toBe(true);
    expect(isAllowedHelpdeskAttachmentMime("video/mp4")).toBe(true);
    expect(isAllowedHelpdeskAttachmentMime("application/x-msdownload")).toBe(false);
    expect(isAllowedHelpdeskAttachmentMime("text/html")).toBe(false);
  });

  it("slugifies tag labels", () => {
    expect(slugifyTag("  Critical Client! ")).toBe("critical-client");
    expect(slugifyTag("Feature_Request")).toBe("feature-request");
  });
});
