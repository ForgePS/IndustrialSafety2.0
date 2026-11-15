import { describe, expect, it } from "vitest";
import {
  SAAS_PERSONA_TO_ROLE_TEMPLATE,
  isSaasMutationPermission,
  permissionsForSaasPersona,
  resolveSaasRolePersona,
  roleTemplateCodeForSaasPersona,
  saasPersonaHasPermission,
} from "./rbac-domain.js";

describe("rbac-domain", () => {
  it("maps SaaS personas to Forge role templates", () => {
    expect(roleTemplateCodeForSaasPersona("owner")).toBe("TENANT_OWNER");
    expect(roleTemplateCodeForSaasPersona("admin")).toBe("TENANT_ADMIN");
    expect(roleTemplateCodeForSaasPersona("member")).toBe("STANDARD_USER");
    expect(roleTemplateCodeForSaasPersona("viewer")).toBe("READ_ONLY_USER");
    expect(SAAS_PERSONA_TO_ROLE_TEMPLATE.viewer).toBe("READ_ONLY_USER");
  });

  it("resolves persona aliases case-insensitively", () => {
    expect(resolveSaasRolePersona("Owner")).toBe("owner");
    expect(resolveSaasRolePersona("VIEWER")).toBe("viewer");
    expect(resolveSaasRolePersona("bogus")).toBeNull();
  });

  it("owner and admin may manage memberships; member and viewer may not", () => {
    expect(saasPersonaHasPermission("owner", "platform.membership.manage")).toBe(true);
    expect(saasPersonaHasPermission("admin", "platform.membership.manage")).toBe(true);
    expect(saasPersonaHasPermission("member", "platform.membership.manage")).toBe(false);
    expect(saasPersonaHasPermission("viewer", "platform.membership.manage")).toBe(false);
  });

  it("member and viewer may read persons but not create", () => {
    for (const persona of ["member", "viewer"] as const) {
      expect(saasPersonaHasPermission(persona, "platform.person.read")).toBe(true);
      expect(saasPersonaHasPermission(persona, "platform.person.create")).toBe(false);
    }
  });

  it("viewer has audit.read; member does not", () => {
    expect(saasPersonaHasPermission("viewer", "platform.audit.read")).toBe(true);
    expect(saasPersonaHasPermission("member", "platform.audit.read")).toBe(false);
  });

  it("exposes stable permission bundles per persona", () => {
    expect(permissionsForSaasPersona("owner").length).toBeGreaterThan(10);
    expect(isSaasMutationPermission("platform.person.create")).toBe(true);
    expect(isSaasMutationPermission("platform.person.read")).toBe(false);
  });
});
