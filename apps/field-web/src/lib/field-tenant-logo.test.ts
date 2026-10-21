import { describe, expect, it } from "vitest";
import { fieldTenantLogoFor, isGenericTenantLogo } from "./field-tenant-logo";

describe("field-tenant-logo", () => {
  it("prefers bundled dark mark for Producers on Field dark UI", () => {
    expect(
      fieldTenantLogoFor({
        slug: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        brandingLogoUrl: "https://cdn.example.com/other.png",
      }),
    ).toEqual({
      src: "/branding/producers-rice-mill-dark.png",
      label: "Producers Rice Mill",
    });
  });

  it("uses uploaded dark Settings logo when present", () => {
    expect(
      fieldTenantLogoFor({
        slug: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        logoDarkUrl: "https://cdn.example.com/dark.png",
        logoLightUrl: "https://cdn.example.com/light.png",
      }),
    ).toEqual({
      src: "https://cdn.example.com/dark.png",
      label: "Producers Rice Mill",
    });
  });

  it("uses bundled light mark when theme is light", () => {
    expect(
      fieldTenantLogoFor({
        slug: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        theme: "light",
      }),
    ).toEqual({
      src: "/branding/producers-rice-mill.png",
      label: "Producers Rice Mill",
    });
  });

  it("leaves Forge tenants to the Field product logo", () => {
    expect(
      fieldTenantLogoFor({
        slug: "forge-platform",
        displayName: "Forge Platform",
      }),
    ).toBeNull();
  });

  it("falls back to published branding when no bundled mark exists", () => {
    expect(
      fieldTenantLogoFor({
        slug: "acme",
        displayName: "Acme Corp",
        brandingLogoUrl: "https://cdn.example.com/acme.png",
      }),
    ).toEqual({
      src: "https://cdn.example.com/acme.png",
      label: "Acme Corp",
    });
  });

  it("ignores generic placeholder logos", () => {
    expect(
      fieldTenantLogoFor({
        slug: "acme",
        displayName: "Acme Corp",
        brandingLogoUrl: "/icons/icon.svg",
      }),
    ).toBeNull();
    expect(isGenericTenantLogo("/icons/icon.svg")).toBe(true);
    expect(isGenericTenantLogo("/branding/forge-industrial-safety.png")).toBe(true);
  });
});
