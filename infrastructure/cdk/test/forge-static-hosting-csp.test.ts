import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildLegacyHostRedirectSnippet,
  LEGACY_REDIRECT_STRIP_QUERY_PARAMS,
} from "../lib/constructs/forge-static-hosting-csp.js";

describe("ForgeStaticHosting CSP (FIS-M01)", () => {
  it("omits unsafe-inline from script-src and does not use bare https: connect-src", () => {
    const csp = buildContentSecurityPolicy({
      apiProxyOriginHostname: "api-dev.forgepublicsafety.com",
      cspConnectSrcExtras: [
        "https://forge-development-123456.auth.us-east-1.amazoncognito.com",
        "blob:",
      ],
    });

    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    // Bare scheme allowlist (connect-src 'self' https:) must not appear; host allowlists use https://…
    const connectSrc = csp.match(/connect-src ([^;]+)/)?.[1] ?? "";
    expect(connectSrc.split(/\s+/)).not.toContain("https:");
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain("https://api-dev.forgepublicsafety.com");
    expect(csp).toContain("https://forge-development-123456.auth.us-east-1.amazoncognito.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("legacy vanity redirect snippet (FIS-L02)", () => {
  it("emits 301 to canonical host and strips OAuth/session query params", () => {
    const snippet = buildLegacyHostRedirectSnippet([
      {
        from: "producers-rice-mill.forgepublicsafety.com",
        to: "producersrice.forgepublicsafety.com",
      },
    ]);

    expect(snippet).toContain("producers-rice-mill.forgepublicsafety.com");
    expect(snippet).toContain("producersrice.forgepublicsafety.com");
    expect(snippet).toContain("statusCode: 301");
    for (const key of LEGACY_REDIRECT_STRIP_QUERY_PARAMS) {
      expect(snippet).toContain(`'${key}': true`);
    }
  });

  it("returns empty when no redirects configured", () => {
    expect(buildLegacyHostRedirectSnippet(undefined)).toBe("");
    expect(buildLegacyHostRedirectSnippet([])).toBe("");
  });
});
