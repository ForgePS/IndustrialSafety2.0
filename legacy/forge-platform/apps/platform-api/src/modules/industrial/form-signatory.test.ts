import { describe, expect, it } from "vitest";
import {
  canDeleteIncidents,
  canDeleteForms,
  canDeleteInspections,
  canDeleteSupplyItems,
  canManageSupplyLocations,
  canDeleteTask,
  taskCreatedByUserId,
  ehsDirectorSignatureValueChanged,
  isEhsDirectorSignatureField,
  isSafetyDirectorRole,
  isSignatureAnswerPresent,
  isSupervisorRole,
  isSupervisorSignatureField,
  missingEhsDirectorSignatureFields,
  missingDeferredSignatureFields,
  missingSupervisorSignatureFields,
  isDeferredSignatoryField,
  principalCanSignEhsDirector,
  resolveFormSubmissionStatus,
  FORM_STATUS_PENDING_SIGNATURE,
} from "./form-signatory.js";

describe("form-signatory", () => {
  it("detects EHS Director signature fields by label", () => {
    expect(
      isEhsDirectorSignatureField({
        id: "sig-1",
        label: "EHS Director Signature",
        type: "signature",
      }),
    ).toBe(true);
    expect(
      isEhsDirectorSignatureField({
        id: "employee-signature",
        label: "Employee Signature",
        type: "signature",
      }),
    ).toBe(false);
    expect(
      isEhsDirectorSignatureField({
        id: "ehs-director-signature-date",
        label: "EHS Director Signature Date",
        type: "date",
      }),
    ).toBe(false);
  });

  it("recognizes Safety Director and Safety Manager roles", () => {
    expect(isSafetyDirectorRole({ roleCode: "SAFETY_DIRECTOR", roleName: "Safety Director" })).toBe(
      true,
    );
    expect(isSafetyDirectorRole({ roleCode: "EHS_DIRECTOR", roleName: "EHS Director" })).toBe(true);
    expect(
      isSafetyDirectorRole({
        roleCode: "INDUSTRIAL_SAFETY_MANAGER",
        roleName: "Safety Manager",
      }),
    ).toBe(true);
    expect(isSafetyDirectorRole({ roleCode: "INDUSTRIAL_EMPLOYEE", roleName: "Employee" })).toBe(
      false,
    );
    expect(
      principalCanSignEhsDirector([
        { roleCode: "INDUSTRIAL_EMPLOYEE", roleName: "Employee" },
        { roleCode: "SAFETY_DIRECTOR", roleName: "Safety Director" },
      ]),
    ).toBe(true);
  });

  it("limits incident delete to EHS Director and Creator", () => {
    expect(canDeleteIncidents({ isPlatformAdmin: true, roles: [] })).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        roles: [],
      }),
    ).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        roles: [{ roleCode: "EHS_DIRECTOR", roleName: "EHS Director" }],
      }),
    ).toBe(true);
    expect(
      canDeleteIncidents({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        roles: [{ roleCode: "INDUSTRIAL_TENANT_ADMIN", roleName: "Tenant Admin" }],
      }),
    ).toBe(false);
  });

  it("limits form delete to Tenant Admin and Creator", () => {
    expect(canDeleteForms({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteForms({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.forms.manage"],
      }),
    ).toBe(false);
  });

  it("limits inspection delete to Tenant Admin and Creator", () => {
    expect(canDeleteInspections({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteInspections({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.inspections.manage"],
      }),
    ).toBe(false);
  });

  it("limits supply item delete to Tenant Admin and Creator", () => {
    expect(canDeleteSupplyItems({ isPlatformAdmin: true })).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canDeleteSupplyItems({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.supplies.manage"],
      }),
    ).toBe(false);
  });

  it("limits supply location edit/delete to Tenant Admin and Creator", () => {
    expect(canManageSupplyLocations({ isPlatformAdmin: true })).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canManageSupplyLocations({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.supplies.manage"],
      }),
    ).toBe(false);
  });

  it("limits task delete to Tenant Admin, Creator, or task author", () => {
    expect(canDeleteTask({ isPlatformAdmin: true, actorUserId: "u1" })).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: new Set(["FORGE_CREATOR"]),
        permissions: [],
        actorUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.admin"],
        actorUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.access"],
        actorUserId: "u1",
        createdByUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canDeleteTask({
        isPlatformAdmin: false,
        activeProducts: new Set(),
        permissions: ["industrial.access"],
        actorUserId: "u1",
        createdByUserId: "u2",
      }),
    ).toBe(false);
    expect(taskCreatedByUserId({ createdByUserId: "author-1" })).toBe("author-1");
    expect(taskCreatedByUserId({ createdBy: "author-2" })).toBe("author-2");
    expect(taskCreatedByUserId(null)).toBeNull();
  });

  it("detects supervisor signature fields", () => {
    expect(
      isSupervisorSignatureField({
        id: "sup-sig",
        label: "Supervisor Signature",
        type: "signature",
      }),
    ).toBe(true);
    expect(
      isSupervisorSignatureField({
        id: "ehs-sig",
        label: "EHS Director Signature",
        type: "signature",
      }),
    ).toBe(false);
    expect(isSupervisorRole({ roleCode: "INDUSTRIAL_SUPERVISOR", roleName: "Supervisor" })).toBe(
      true,
    );
  });

  it("lists missing EHS signatures and detects changes", () => {
    const fields = [
      { id: "employee-signature", label: "Employee Signature", type: "signature" },
      { id: "ehs-sig", label: "EHS Director Signature", type: "signature" },
    ];
    expect(
      missingEhsDirectorSignatureFields(fields, { "employee-signature": "data:image/png;a" }),
    ).toEqual([fields[1]]);
    expect(ehsDirectorSignatureValueChanged("ehs-sig", {}, { "ehs-sig": "data:image/png;a" })).toBe(
      true,
    );
    expect(
      ehsDirectorSignatureValueChanged(
        "ehs-sig",
        { "ehs-sig": "data:image/png;a" },
        { "ehs-sig": "data:image/png;a" },
      ),
    ).toBe(false);
  });

  it("tracks deferred supervisor and EHS signatures together", () => {
    const fields = [
      { id: "employee-signature", label: "Employee Signature", type: "signature" },
      { id: "supervisor-signature", label: "Supervisor Signature", type: "signature" },
      { id: "ehs-sig", label: "EHS Director Signature", type: "signature" },
      {
        id: "supervisor-signature-date",
        label: "Supervisor Signature Date",
        type: "date",
      },
    ];
    const answers = { "employee-signature": "data:image/png;a" };
    expect(missingSupervisorSignatureFields(fields, answers).map((f) => f.id)).toEqual([
      "supervisor-signature",
    ]);
    expect(missingDeferredSignatureFields(fields, answers).map((f) => f.id)).toEqual([
      "ehs-sig",
      "supervisor-signature",
    ]);
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
        label: "Employee Signature Date",
        type: "date",
      }),
    ).toBe(false);
  });

  it("treats metadata-only signature objects as present", () => {
    expect(
      isSignatureAnswerPresent({
        signedByName: "Jane Supervisor",
        signedAt: "2026-08-01T12:00:00.000Z",
        method: "typed",
      }),
    ).toBe(true);
    expect(isSignatureAnswerPresent({ signedByName: "Jane Supervisor" })).toBe(true);
    expect(isSignatureAnswerPresent({ signedAt: "2026-08-01" })).toBe(true);
    expect(isSignatureAnswerPresent({ method: "draw" })).toBe(false);
  });

  it("clears pending status when deferred signatures are metadata-only", () => {
    const fields = [
      { id: "employee-signature", label: "Employee Signature", type: "signature" },
      { id: "supervisor-signature", label: "Supervisor Signature", type: "signature" },
      { id: "ehs-sig", label: "EHS Director Signature", type: "signature" },
    ];
    const answers = {
      "employee-signature": "data:image/png;base64,AAA",
      "supervisor-signature": {
        signedByName: "Supervisor One",
        signedAt: "2026-08-01T12:00:00.000Z",
      },
      "ehs-sig": {
        signedByName: "Safety Director",
        signedAt: "2026-08-02T12:00:00.000Z",
      },
    };
    expect(missingDeferredSignatureFields(fields, answers)).toEqual([]);
    expect(resolveFormSubmissionStatus(fields, answers, FORM_STATUS_PENDING_SIGNATURE)).toBe(
      "SUBMITTED",
    );
  });
});
