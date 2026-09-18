import { describe, expect, it } from "vitest";
import {
  publicLoginBrandingSchema,
} from "./login-branding.public-schema.js";

describe("publicLoginBrandingSchema (FIS-L01)", () => {
  const valid = {
    host: "producersrice.forgepublicsafety.com",
    displayName: "Producers Rice Mill",
    brandLabel: "Producers Rice Mill",
    logoUrl: "/branding/producers-rice-mill.png",
    primaryColor: "#0a5c2f",
    login: {
      logoUrl: "/branding/producers-rice-mill.png",
      brandLabel: "Producers Rice Mill",
      headline: "Welcome to Producers Rice Mill",
      body: "Sign in is required to continue.",
      statusText: "",
      buttonLabel: "Sign in",
    },
  };

  it("accepts presentation-only fields", () => {
    expect(publicLoginBrandingSchema.parse(valid)).toEqual(valid);
  });

  it("rejects tenantId and other unexpected keys", () => {
    expect(() =>
      publicLoginBrandingSchema.parse({
        ...valid,
        tenantId: "019ff7d0-c20f-7659-81e4-c0cd68e23262",
      }),
    ).toThrow();

    expect(() =>
      publicLoginBrandingSchema.parse({
        ...valid,
        tenantKey: "producers-rice-mill",
      }),
    ).toThrow();
  });

  it("documents allowed top-level keys", () => {
    const shape = publicLoginBrandingSchema.shape;
    expect(Object.keys(shape).sort()).toEqual(
      ["brandLabel", "displayName", "host", "login", "logoUrl", "primaryColor"].sort(),
    );
    expect("tenantId" in shape).toBe(false);
  });
});
