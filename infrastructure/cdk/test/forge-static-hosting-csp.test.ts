import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildLegacyHostRedirectSnippet,
  LEGACY_REDIRECT_STRIP_QUERY_PARAMS,
} from "../lib/constructs/forge-static-hosting-csp.js";

describe("ForgeStaticHosting CSP (FIS-M01)", () => {
  it("limits script-src to self plus inline (never eval) and does not use bare https: connect-src", () => {
    const csp = buildContentSecurityPolicy({
      apiProxyOriginHostname: "api-dev.forgepublicsafety.com",
      cspConnectSrcExtras: [
        "https://forge-development-123456.auth.us-east-1.amazoncognito.com",
        "blob:",
      ],
    });

    // Next.js static export embeds RSC flight data as inline <script>, so unsafe-inline is
    // intentional (see forge-static-hosting-csp.ts). No other script sources and never eval.
    expect(csp.match(/script-src ([^;]+)/)?.[1]).toBe("'self' 'unsafe-inline'");
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

describe("DirectoryIndex trailingSlash soft-nav (.txt)", () => {
  it("documents the page.txt → page/index.txt rewrite used for iPad LOTO soft-nav", () => {
    // Runtime CF Function is inline in forge-static-hosting.ts; assert the contract
    // stays in source so Field /loto/{id}.txt is not SPA-fallback HTML 200.
    const source = fs.readFileSync(
      path.join(__dirname, "../lib/constructs/forge-static-hosting.ts"),
      "utf8",
    );
    expect(source).toContain("uri.slice(0, -4) + '/index.txt'");
    expect(source).toContain("shellExt");
    expect(source).toContain("Non-JSON (HTTP 200)");
    const fieldSource = fs.readFileSync(
      path.join(__dirname, "../lib/constructs/forge-field-hosting.ts"),
      "utf8",
    );
    expect(fieldSource).toContain("fieldLoto");
    expect(fieldSource).toContain("/loto/placeholder/' + shellExt");
  });
});

describe("legacy vanity redirect snippet (FIS-L02)", () => {
  it("emits 301 to established publicsafety vanity and strips OAuth/session query params", () => {
    const snippet = buildLegacyHostRedirectSnippet([
      {
        from: "producers-rice-mill.forgepublicsafety.com",
        to: "producersrice.forgepublicsafety.com",
      },
    ]);

    expect(snippet).toContain("producers-rice-mill.forgepublicsafety.com");
    expect(snippet).toContain("producersrice.forgepublicsafety.com");
    expect(snippet).not.toContain("forgeindustrialsafety.com");
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
