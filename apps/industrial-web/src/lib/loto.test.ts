import { describe, expect, it } from "vitest";
import {
  canIssueLockout,
  lotoStats,
  lotoStatusBadgeClass,
  lotoStatusLabel,
} from "./loto";

describe("loto workspace helpers", () => {
  it("maps procedure and lockout statuses onto Sneat badge tones", () => {
    expect(lotoStatusBadgeClass("ACTIVE")).toBe("bg-label-success");
    expect(lotoStatusBadgeClass("IN_REVIEW")).toBe("bg-label-warning");
    expect(lotoStatusBadgeClass("ISSUED")).toBe("bg-label-info");
    expect(lotoStatusLabel("PENDING_APPROVAL")).toBe("Pending approval");
  });

  it("only issues lockouts from approved or active procedures", () => {
    expect(canIssueLockout("DRAFT")).toBe(false);
    expect(canIssueLockout("APPROVED")).toBe(true);
    expect(canIssueLockout("ACTIVE")).toBe(true);
  });

  it("counts drafts, reviews, and open lockouts", () => {
    expect(
      lotoStats(
        [{ status: "DRAFT" }, { status: "IN_REVIEW" }, { status: "ACTIVE" }],
        [{ status: "ISSUED" }, { status: "CLOSED" }],
      ),
    ).toEqual({
      procedures: 3,
      drafts: 1,
      active: 1,
      reviews: 1,
      openLockouts: 1,
    });
  });
});
