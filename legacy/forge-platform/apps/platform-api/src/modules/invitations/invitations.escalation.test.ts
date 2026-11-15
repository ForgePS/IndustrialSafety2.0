import { describe, expect, it } from "vitest";
import { isCreatorOnlyPermission } from "@forge/contracts";

/**
 * Role escalation on invitations uses MembershipsService.assertGrantable
 * (creator-only permissions refused for non-platform admins).
 */
describe("invitation role escalation policy", () => {
  it("treats platform.tenant.create as creator-only", () => {
    expect(isCreatorOnlyPermission("platform.tenant.create")).toBe(true);
    expect(isCreatorOnlyPermission("platform.person.read")).toBe(false);
  });
});
