import { describe, expect, it } from "vitest";
import {
  canApproveFieldLoto,
  canAuthorFieldLoto,
  canViewFieldLoto,
  hasFieldAccess,
  hasFieldPermission,
} from "./field-permissions";

describe("field permissions", () => {
  it("allows industrial.access as transitional Field gate", () => {
    expect(hasFieldAccess(["industrial.access"])).toBe(true);
    expect(hasFieldAccess(["field.access"])).toBe(true);
    expect(hasFieldAccess(["platform.person.read"])).toBe(false);
  });

  it("lets platform admin and Creator use Field without a tenant role pack", () => {
    expect(hasFieldAccess([], { isPlatformAdmin: true })).toBe(true);
    expect(hasFieldAccess([], { activeProducts: ["FORGE_CREATOR"] })).toBe(true);
    expect(hasFieldPermission([], "field.loto.execute", { isPlatformAdmin: true })).toBe(true);
    expect(
      hasFieldPermission([], "field.loto.execute", { activeProducts: ["FORGE_CREATOR"] }),
    ).toBe(true);
  });

  it("checks specific field permissions", () => {
    expect(hasFieldPermission(["field.scan"], "field.scan")).toBe(true);
    expect(hasFieldPermission(["field.access"], "field.scan")).toBe(false);
    expect(hasFieldPermission(["industrial.admin"], "field.supervisor.dashboard")).toBe(true);
  });

  it("treats Industrial web permissions as the same Field capability", () => {
    expect(hasFieldPermission(["industrial.loto.view"], "field.loto.execute")).toBe(true);
    expect(hasFieldPermission(["industrial.inspections.view"], "field.inspections.perform")).toBe(
      true,
    );
    expect(hasFieldPermission(["industrial.training.view"], "field.training.view")).toBe(true);
    expect(hasFieldPermission(["industrial.jsa.manage"], "field.jsa.execute")).toBe(true);
  });

  it("lets anyone who can view LOTO on web open it in Field", () => {
    expect(canViewFieldLoto(["industrial.loto.view"])).toBe(true);
    expect(canViewFieldLoto(["industrial.access"])).toBe(true);
    expect(canViewFieldLoto(["field.loto.execute"])).toBe(true);
    expect(canViewFieldLoto(["platform.person.read"])).toBe(false);
    expect(canViewFieldLoto([], { isPlatformAdmin: true })).toBe(true);
  });

  it("lets Field authors create and edit procedures", () => {
    expect(canAuthorFieldLoto(["field.loto.execute"])).toBe(true);
    expect(canAuthorFieldLoto(["field.access"])).toBe(true);
    expect(canAuthorFieldLoto(["industrial.loto.edit"])).toBe(true);
    expect(canAuthorFieldLoto(["industrial.loto.view"])).toBe(false);
    expect(canAuthorFieldLoto([], { isPlatformAdmin: true })).toBe(true);
  });

  it("gates EHS approve to approve/manage/admin", () => {
    expect(canApproveFieldLoto(["industrial.loto.approve"])).toBe(true);
    expect(canApproveFieldLoto(["industrial.loto.manage"])).toBe(true);
    expect(canApproveFieldLoto(["industrial.admin"])).toBe(true);
    expect(canApproveFieldLoto(["industrial.loto.edit"])).toBe(false);
    expect(canApproveFieldLoto(["field.loto.execute"])).toBe(false);
    expect(canApproveFieldLoto([], { isPlatformAdmin: true })).toBe(true);
  });
});
