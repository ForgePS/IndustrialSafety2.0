import { describe, expect, it } from "vitest";
import { sameOriginBrandingLogoUrl } from "./login-branding.service.js";

describe("sameOriginBrandingLogoUrl", () => {
  it("keeps relative branding paths", () => {
    expect(sameOriginBrandingLogoUrl("/branding/producers-rice-mill.png")).toBe(
      "/branding/producers-rice-mill.png",
    );
  });

  it("rewrites stale absolute branding hosts to same-origin paths", () => {
    expect(
      sameOriginBrandingLogoUrl(
        "https://producersrice.forgepublicsafety.com/branding/producers-rice-mill.png",
      ),
    ).toBe("/branding/producers-rice-mill.png");
    expect(
      sameOriginBrandingLogoUrl(
        "https://producersrice.forgeindustrialsafety.com/branding/producers-rice-mill-dark.png",
      ),
    ).toBe("/branding/producers-rice-mill-dark.png");
  });
});
