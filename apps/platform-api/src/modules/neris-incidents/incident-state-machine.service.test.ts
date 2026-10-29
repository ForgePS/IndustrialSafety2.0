import { describe, expect, it } from "vitest";
import type { ForgePrincipal } from "@forge/tenant-context";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";

function principal(permissions: string[]): ForgePrincipal {
  return {
    authenticationIdentityId: "test",
    userId: "user-1",
    personId: "person-1",
    tenantId: "tenant-1",
    organizationIds: [],
    permissions: new Set(permissions),
    activeProducts: new Set(["FORGE_RMS"]),
    activeModules: new Set(["NERIS"]),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

describe("IncidentStateMachineService", () => {
  const sm = new IncidentStateMachineService();

  it("treats draft and returned incidents as editable", () => {
    expect(sm.isEditable("DRAFT")).toBe(true);
    expect(sm.isEditable("RETURNED_FOR_CORRECTION")).toBe(true);
    expect(sm.isLocked("FINALIZED")).toBe(true);
  });

  it("allows draft to in_progress and void transitions", () => {
    expect(() => sm.assertTransition("DRAFT", "IN_PROGRESS", principal([]))).not.toThrow();
    expect(() =>
      sm.assertTransition("DRAFT", "VOIDED", principal(["rms.neris.incident.void"])),
    ).not.toThrow();
  });

  it("blocks invalid transitions", () => {
    expect(() => sm.assertTransition("DRAFT", "APPROVED", principal([]))).toThrow(
      /Cannot transition/,
    );
    expect(() => sm.assertTransition("FINALIZED", "DRAFT", principal([]))).toThrow(
      /Cannot transition/,
    );
  });

  it("requires permissions for workflow targets", () => {
    expect(() => sm.assertTransition("SUBMITTED_FOR_REVIEW", "APPROVED", principal([]))).toThrow(
      /Missing permission/,
    );
    expect(() =>
      sm.assertTransition(
        "SUBMITTED_FOR_REVIEW",
        "APPROVED",
        principal(["rms.neris.incident.approve"]),
      ),
    ).not.toThrow();
  });

  it("promotes draft to in_progress on first edit", () => {
    expect(sm.promoteDraftIfNeeded("DRAFT")).toBe("IN_PROGRESS");
    expect(sm.promoteDraftIfNeeded("READY_FOR_REVIEW")).toBe("READY_FOR_REVIEW");
  });
});
