import { describe, expect, it } from "vitest";
import { vanityLoginBrandingForHost } from "./vanity-login-branding";

describe("vanityLoginBrandingForHost", () => {
  it("returns Producers branding for producersrice host", () => {
    const row = vanityLoginBrandingForHost("producersrice.forgepublicsafety.com");
    expect(row?.tenantId).toBe("019ff7d0-c20f-7659-81e4-c0cd68e23262");
    expect(row?.login.logoUrl).toBe("/branding/producers-rice-mill.png");
    expect(row?.login.brandLabel).toBe("Producers Rice Mill");
  });

  it("returns Producers branding for forgeindustrialsafety vanity host", () => {
    const row = vanityLoginBrandingForHost("producersrice.forgeindustrialsafety.com");
    expect(row?.tenantId).toBe("019ff7d0-c20f-7659-81e4-c0cd68e23262");
    expect(row?.login.brandLabel).toBe("Producers Rice Mill");
  });

  it("returns null for the default industrial host", () => {
    expect(vanityLoginBrandingForHost("industrial.forgepublicsafety.com")).toBeNull();
  });

  it("returns null for marketing apex", () => {
    expect(vanityLoginBrandingForHost("forgeindustrialsafety.com")).toBeNull();
  });
});
