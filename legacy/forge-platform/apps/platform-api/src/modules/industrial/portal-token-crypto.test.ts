import { describe, expect, it } from "vitest";
import { openPortalToken, sealPortalToken, withSealedPortalToken } from "./portal-token-crypto.js";

describe("portal token crypto", () => {
  it("seals and opens a portal token for the same tenant", () => {
    const tenantId = "tenant-a";
    const token = "abc123portalTokenExample";
    const sealed = sealPortalToken(tenantId, token);
    expect(openPortalToken(tenantId, sealed)).toBe(token);
  });

  it("does not open a token for a different tenant", () => {
    const sealed = sealPortalToken("tenant-a", "secret-token");
    expect(openPortalToken("tenant-b", sealed)).toBeNull();
  });

  it("stores sealed token in policy json", () => {
    const next = withSealedPortalToken({ assignedOnly: true }, "tenant-a", "token-xyz");
    expect(typeof next.portalTokenSealed).toBe("string");
    expect(openPortalToken("tenant-a", String(next.portalTokenSealed))).toBe("token-xyz");
  });
});
