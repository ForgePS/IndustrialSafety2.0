import { describe, expect, it } from "vitest";
import {
  emailsMatchForInvitationAccept,
  invitationStatusesForSaasPending,
  isActiveInvitationStatus,
  isTerminalInvitationStatus,
  resolveInvitationStatusAlias,
} from "./invitation-domain.js";

describe("invitation-domain", () => {
  it("maps SaaS aliases to storage statuses", () => {
    expect(resolveInvitationStatusAlias("pending")).toBe("PENDING");
    expect(resolveInvitationStatusAlias("Accepted")).toBe("ACCEPTED");
    expect(resolveInvitationStatusAlias("EXPIRED")).toBe("EXPIRED");
    expect(resolveInvitationStatusAlias("bogus")).toBeNull();
  });

  it("treats DRAFT/PENDING/SENT as active", () => {
    expect(isActiveInvitationStatus("SENT")).toBe(true);
    expect(isTerminalInvitationStatus("REVOKED")).toBe(true);
    expect(invitationStatusesForSaasPending()).toEqual(["DRAFT", "PENDING", "SENT"]);
  });

  it("compares accept emails case-insensitively", () => {
    expect(emailsMatchForInvitationAccept("A@B.Com", "a@b.com")).toBe(true);
    expect(emailsMatchForInvitationAccept("a@b.com", "other@b.com")).toBe(false);
  });
});
