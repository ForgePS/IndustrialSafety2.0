import { describe, expect, it } from "vitest";
import {
  canDeleteIncidents,
  canDeleteForms,
  canDeleteInspections,
  canDeleteSupplyItems,
  canManageSupplyLocations,
  canDeleteTask,
  taskCreatedByUserId,
  isDeferredSignatoryField,
  isEhsDirectorSignatureField,
  isSafetyDirectorRole,
  isSupervisorSignatureField,
  principalCanSignEhsDirector,
} from "./form-signatory";

describe("form-signatory (web)", () => {
  it("locks EHS Director signature fields to Safety Director roles", () => {
    expect(
      isEhsDirectorSignatureField({
        id: "ehs",
        label: "EHS Director Signature",
        type: "signature",
      }),
    ).toBe(true);
    expect(
      principalCanSignEhsDirector([{ roleCode: "INDUSTRIAL_EMPLOYEE", roleName: "Employee" }]),
    ).toBe(false);
    expect(isSafetyDirectorRole({ roleCode: "EHS_DIRECTOR", roleName: "EHS Director" })).toBe(true);
    expect(
      principalCanSignEhsDirector([{ roleCode: "EHS_DIRECTOR", roleName: "EHS Director" }]),
    ).toBe(true);
  });

  it("detects supervisor signature fields for remote sign links", () => {
    expect(
      isSupervisorSignatureField({
        id: "supervisor-signature",
        label: "Supervisor Signature",
        type: "signature",
      }),
    ).toBe(true);
  });

  it("defers supervisor and EHS signature dates on initial save", () => {
    expect(
      isDeferredSignatoryField({
        id: "supervisor-signature-date",
        label: "Supervisor Signature Date",
        type: "date",
      }),
    ).toBe(true);
    expect(
      isDeferredSignatoryField({
        id: "employee-signature-date",
        label: "EMPLOYEE Signature Date",
        type: "date",
      }),
    ).toBe(false);
  });

  it("limits incident delete to EHS Director and Creator", () => {
    expect(canDeleteIncidents({ isPlatformAdmin: true, roles: [] })).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        roles: [],
      }),
    ).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: [],
        roles: [{ roleCode: "INDUSTRIAL_SAFETY_MANAGER", roleName: "Safety Director" }],
      }),
    ).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: [],
        roles: [{ roleCode: "EHS_DIRECTOR", roleName: "EHS Director" }],
      }),
    ).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: [],
        roles: [{ roleCode: "INDUSTRIAL_TENANT_ADMIN", roleName: "Tenant Admin" }],
      }),
    ).toBe(false);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: [],
        roles: [{ roleCode: "INDUSTRIAL_SUPERVISOR", roleName: "Supervisor" }],
      }),
    ).toBe(false);
  });

  it("limits form delete to Tenant Admin and Creator", () => {
    expect(canDeleteForms({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.forms.manage"],
      }),
    ).toBe(false);
  });

  it("limits inspection delete to Tenant Admin and Creator", () => {
    expect(canDeleteInspections({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.inspections.manage"],
      }),
    ).toBe(false);
  });

  it("limits supply item delete to Tenant Admin and Creator", () => {
    expect(canDeleteSupplyItems({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.supplies.manage"],
      }),
    ).toBe(false);
  });

  it("limits supply location edit/delete to Tenant Admin and Creator", () => {
    expect(canManageSupplyLocations({ isPlatformAdmin: true })).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.supplies.manage"],
      }),
    ).toBe(false);
  });

  it("limits task delete to Tenant Admin, Creator, or task author", () => {
    expect(canDeleteTask({ isPlatformAdmin: true, actorUserId: "u1" })).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
        actorUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.admin"],
        actorUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.access"],
        actorUserId: "u1",
        createdByUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: [],
        permissions: ["industrial.access"],
        actorUserId: "u1",
        createdByUserId: "u2",
      }),
    ).toBe(false);
    expect(taskCreatedByUserId({ createdByUserId: "author-1", title: "Task" })).toBe("author-1");
    expect(taskCreatedByUserId({ createdById: "author-2" })).toBe("author-2");
    expect(taskCreatedByUserId({})).toBeNull();
  });
});
