import { describe, expect, it } from "vitest";
import { bundledNavLogoForTenant, navLogoForTenant } from "./tenant-nav-logo";

describe("navLogoForTenant", () => {
  it("uses the Producers light logo by default", () => {
    expect(bundledNavLogoForTenant("producers-rice-mill", "Producers Rice Mill")).toEqual({
      src: "/branding/producers-rice-mill.png",
      label: "Producers Rice Mill",
    });
  });

  it("uses the Producers dark logo in dark theme", () => {
    expect(bundledNavLogoForTenant("producers-rice-mill", "Producers Rice Mill", "dark")).toEqual({
      src: "/branding/producers-rice-mill-dark.png",
      label: "Producers Rice Mill",
    });
  });

  it("uses the Forge Industrial Safety logo for the Forge Platform tenant", () => {
    expect(navLogoForTenant({ slug: "forge-platform", displayName: "Forge Platform" })).toEqual({
      src: "/branding/forge-industrial-safety.png",
      label: "Forge Industrial Safety",
    });
  });

  it("prefers Settings/config branding over bundled marks", () => {
    expect(
      navLogoForTenant({
        slug: "producers-rice-mill",
        theme: "dark",
        logoLightUrl: "https://cdn.example/light.png",
        logoDarkUrl: "https://cdn.example/dark.png",
      })?.src,
    ).toBe("https://cdn.example/dark.png");
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

  it("uses bundled dark mark when no Settings logos are uploaded", () => {
    expect(
      navLogoForTenant({
        slug: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        theme: "dark",
      })?.src,
    ).toBe("/branding/producers-rice-mill-dark.png");
  });
});
