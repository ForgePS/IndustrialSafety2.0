import { describe, expect, it } from "vitest";
import { evaluateClassificationGate } from "./index.js";

describe("evaluateClassificationGate", () => {
  it("allows PUBLIC and INTERNAL", () => {
    expect(
      evaluateClassificationGate({
        classification: "PUBLIC",
        tenantAllowsConfidential: false,
        tenantAllowsRestricted: false,
        hasSensitivePermission: false,
        authorizeSensitiveData: false,
      }).allowed,
    ).toBe(true);
  });

  it("blocks RESTRICTED by default", () => {
    const result = evaluateClassificationGate({
      classification: "RESTRICTED",
      tenantAllowsConfidential: true,
      tenantAllowsRestricted: false,
      hasSensitivePermission: true,
      authorizeSensitiveData: true,
      businessPurpose: "investigation",
    });
    expect(result.allowed).toBe(false);
  });
});
