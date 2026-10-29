import { describe, expect, it } from "vitest";
import {
  canApproveVersion,
  canObsoleteDocument,
  canRejectVersion,
  canSubmitVersionForReview,
  documentLibraryFilterMatch,
  isReviewDueSoon,
  isReviewOverdue,
  matchesDistributionScope,
  normalizeDocWorkflow,
} from "./document-control-workflow";

describe("document-control-workflow", () => {
  it("normalizes legacy and workflow statuses", () => {
    expect(normalizeDocWorkflow("ACTIVE")).toBe("PUBLISHED");
    expect(normalizeDocWorkflow("APPROVED")).toBe("PUBLISHED");
    expect(normalizeDocWorkflow("ARCHIVED")).toBe("OBSOLETE");
    expect(normalizeDocWorkflow("IN_REVIEW")).toBe("IN_REVIEW");
    expect(normalizeDocWorkflow(null)).toBe("DRAFT");
  });

  it("gates version submit / approve / reject", () => {
    expect(canSubmitVersionForReview("DRAFT", "DRAFT")).toBe(true);
    expect(canSubmitVersionForReview("DRAFT", "PUBLISHED")).toBe(true);
    expect(canSubmitVersionForReview("IN_REVIEW", "DRAFT")).toBe(false);
    expect(canApproveVersion("IN_REVIEW")).toBe(true);
    expect(canApproveVersion("DRAFT")).toBe(false);
    expect(canRejectVersion("IN_REVIEW")).toBe(true);
    expect(canObsoleteDocument("PUBLISHED")).toBe(true);
    expect(canObsoleteDocument("DRAFT")).toBe(false);
  });

  it("detects overdue and due-soon reviews", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    expect(isReviewOverdue("2026-09-01T00:00:00.000Z", now)).toBe(true);
    expect(isReviewOverdue("2026-09-09T00:00:00.000Z", now)).toBe(false);
    expect(isReviewDueSoon("2026-09-20T00:00:00.000Z", 30, now)).toBe(true);
    expect(isReviewDueSoon("2026-11-01T00:00:00.000Z", 30, now)).toBe(false);
    expect(isReviewOverdue(null, now)).toBe(false);
  });

  it("matches tenant / site / department / role distribution", () => {
    expect(
      matchesDistributionScope([{ scopeType: "TENANT", scopeId: null, enabled: true }], {
        siteId: null,
        departmentId: null,
        roleIds: [],
      }),
    ).toBe(true);

    expect(
      matchesDistributionScope([{ scopeType: "SITE", scopeId: "site-a", enabled: true }], {
        siteId: "site-a",
        departmentId: null,
        roleIds: [],
      }),
    ).toBe(true);

    expect(
      matchesDistributionScope([{ scopeType: "ROLE", scopeId: "role-x", enabled: true }], {
        siteId: null,
        departmentId: null,
        roleIds: ["role-y"],
      }),
    ).toBe(false);

    expect(
      matchesDistributionScope([{ scopeType: "DEPARTMENT", scopeId: "dept-1", enabled: true }], {
        siteId: null,
        departmentId: "dept-1",
        roleIds: [],
      }),
    ).toBe(true);

    // empty enabled set → visible
    expect(matchesDistributionScope([], { siteId: "x" })).toBe(true);
  });

  it("filters library rows by q, category, workflow, and site", () => {
    const row = {
      name: "Lockout Tagout SOP",
      category: "SOP",
      workflowStatus: "ACTIVE",
      siteId: "site-1",
    };
    expect(documentLibraryFilterMatch(row, { q: "lockout" })).toBe(true);
    expect(documentLibraryFilterMatch(row, { category: "POLICY" })).toBe(false);
    expect(documentLibraryFilterMatch(row, { workflowStatus: "PUBLISHED" })).toBe(true);
    expect(documentLibraryFilterMatch(row, { siteId: "site-2" })).toBe(false);
  });
});
