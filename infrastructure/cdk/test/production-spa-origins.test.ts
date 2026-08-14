import { describe, expect, it } from "vitest";
import { PRODUCTION_PRE_CUTOVER_SPA_ORIGINS } from "../lib/config/production-spa-origins.js";

/**
 * Guard: Creator (and sibling SPAs) are served from CloudFront default domains
 * until customer DNS cutover. API CloudFront CORS (originOverride=true) must
 * allow those exact Origins or browsers report "Failed to fetch".
 */
describe("production pre-cutover SPA origins", () => {
  it("includes the live Creator Console CloudFront origin", () => {
    expect(PRODUCTION_PRE_CUTOVER_SPA_ORIGINS).toContain(
      "https://d204ytvvxvsqgl.cloudfront.net",
    );
  });

  it("uses https only (no wildcard, no localhost)", () => {
    for (const origin of PRODUCTION_PRE_CUTOVER_SPA_ORIGINS) {
      expect(origin.startsWith("https://")).toBe(true);
      expect(origin.includes("*")).toBe(false);
      expect(origin.includes("localhost")).toBe(false);
    }
  });

  it("documents that first-party vanity hosts use a zone suffix, not this exact list", () => {
    // Exact CloudFront defaults stay here. Tenant vanity hosts under
    // forgepublicsafety.com are covered by CORS_ORIGIN_SUFFIXES /
    // CloudFront https://*.forgepublicsafety.com (see forge-api-cloudfront).
    expect(
      PRODUCTION_PRE_CUTOVER_SPA_ORIGINS.some((o) => o.includes("producers-rice-mill")),
    ).toBe(false);
  });
});
