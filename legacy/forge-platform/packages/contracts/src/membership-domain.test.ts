import { describe, expect, it } from "vitest";
import {
  isMembershipStatusActive,
  membershipStatusBlocksTenantSelection,
  resolveMembershipStatusAlias,
  SAAS_MEMBERSHIP_STATUS_ALIASES,
} from "./membership-domain.js";

describe("membership status aliases", () => {
  it("maps SaaS vocabulary onto ADR-021 statuses", () => {
    expect(SAAS_MEMBERSHIP_STATUS_ALIASES.pending).toBe("PENDING");
    expect(SAAS_MEMBERSHIP_STATUS_ALIASES.active).toBe("ACTIVE");
    expect(SAAS_MEMBERSHIP_STATUS_ALIASES.inactive).toBe("SUSPENDED");
    expect(SAAS_MEMBERSHIP_STATUS_ALIASES.removed).toBe("REVOKED");
  });

  it("resolves aliases and canonical statuses", () => {
    expect(resolveMembershipStatusAlias("inactive")).toBe("SUSPENDED");
    expect(resolveMembershipStatusAlias("REMOVED")).toBe("REVOKED");
    expect(resolveMembershipStatusAlias("ACTIVE")).toBe("ACTIVE");
    expect(resolveMembershipStatusAlias("nope")).toBeNull();
  });

  it("only ACTIVE statuses grant tenant selection", () => {
    expect(isMembershipStatusActive("ACTIVE")).toBe(true);
    expect(isMembershipStatusActive("PENDING")).toBe(false);
    expect(isMembershipStatusActive("SUSPENDED")).toBe(false);
    expect(isMembershipStatusActive("REVOKED")).toBe(false);
    expect(membershipStatusBlocksTenantSelection("SUSPENDED")).toBe(true);
  });
});
