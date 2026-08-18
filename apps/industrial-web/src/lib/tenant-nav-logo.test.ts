import { describe, expect, it } from "vitest";
import { bundledNavLogoForTenant, navLogoForTenant } from "./tenant-nav-logo";

describe("navLogoForTenant", () => {
  it("uses the Producers logo for the Producers Rice Mill tenant", () => {
    expect(bundledNavLogoForTenant("producers-rice-mill", "Producers Rice Mill")).toEqual({
      src: "/branding/producers-rice-mill.png",
      label: "Producers Rice Mill",
    });
  });

  it("uses the Forge logo for the Forge Platform tenant", () => {
    expect(navLogoForTenant({ slug: "forge-platform", displayName: "Forge Platform" })).toEqual({
      src: "/branding/forge-platform.svg",
      label: "Forge",
    });
  });

  it("falls back to published branding for unknown tenants", () => {
    expect(
      navLogoForTenant({
        slug: "acme-safety",
        displayName: "Acme Safety",
        brandingLogoUrl: "https://cdn.example/acme.svg",
      }),
    ).toEqual({ src: "https://cdn.example/acme.svg", label: "Acme Safety" });
  });

  it("prefers the bundled tenant mark over a published logoUrl", () => {
    expect(
      navLogoForTenant({
        slug: "producers-rice-mill",
        brandingLogoUrl: "https://cdn.example/other.png",
      })?.src,
    ).toBe("/branding/producers-rice-mill.png");
  });
});
