import { describe, expect, it } from "vitest";
import {
  brandingObjectKeyPrefix,
  documentBelongsToTenant,
  isSignedAccessExpired,
  objectKeyBelongsToTenant,
  putTenantBrandingInputSchema,
} from "./branding-domain.js";

describe("branding-domain (MK-S14)", () => {
  it("rejects cross-tenant object keys", () => {
    expect(objectKeyBelongsToTenant("tenants/a/branding/x.png", "a")).toBe(true);
    expect(objectKeyBelongsToTenant("tenants/b/branding/x.png", "a")).toBe(false);
  });

  it("rejects cross-tenant document ownership", () => {
    expect(documentBelongsToTenant("tenant-a", "tenant-a")).toBe(true);
    expect(documentBelongsToTenant("tenant-b", "tenant-a")).toBe(false);
  });

  it("treats past expiresAt as expired signed access", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isSignedAccessExpired(past)).toBe(true);
    expect(isSignedAccessExpired(future)).toBe(false);
  });

  it("builds branding key prefixes under tenant", () => {
    expect(brandingObjectKeyPrefix("t1")).toBe("tenants/t1/branding/");
  });

  it("accepts MK-S14 branding fields", () => {
    const parsed = putTenantBrandingInputSchema.parse({
      displayName: "Acme Safety",
      shortName: "Acme",
      approvedColorsJson: ["#14532d", "#166534"],
      reportIdentity: "Acme Safety Reports",
      documentFooter: "Confidential",
    });
    expect(parsed.shortName).toBe("Acme");
  });

  it("picks theme logo with dark/light fallbacks", async () => {
    const { pickThemeLogoUrl } = await import("./branding-domain.js");
    expect(
      pickThemeLogoUrl({
        theme: "dark",
        logoLightUrl: "https://cdn.example/light.png",
        logoDarkUrl: "https://cdn.example/dark.png",
      }),
    ).toBe("https://cdn.example/dark.png");
    expect(
      pickThemeLogoUrl({
        theme: "dark",
        logoLightUrl: "https://cdn.example/light.png",
        logoDarkUrl: "",
      }),
    ).toBe("https://cdn.example/light.png");
    expect(
      pickThemeLogoUrl({
        theme: "light",
        logoLightUrl: "",
        logoDarkUrl: "https://cdn.example/dark.png",
        fallbackUrl: "https://cdn.example/fallback.png",
      }),
    ).toBe("https://cdn.example/fallback.png");
  });
});
