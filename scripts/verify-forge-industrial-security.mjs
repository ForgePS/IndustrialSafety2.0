#!/usr/bin/env node
/**
 * verify-forge-industrial-security.mjs
 *
 * Static source checks for FIS-SEC-AUDIT-001 remediation gates.
 * Run from repo root: `node scripts/verify-forge-industrial-security.mjs`
 *
 * Exit 0 when all checks PASS or REVIEW (with justification printed).
 * Exit 1 when any check FAILs.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ id: string, status: "PASS" | "FAIL" | "REVIEW", detail: string }[]} */
const results = [];

function read(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function check(id, ok, detail, review = false) {
  results.push({
    id,
    status: ok ? "PASS" : review ? "REVIEW" : "FAIL",
    detail,
  });
}

const authStorage = read("packages/web-kit/src/auth-storage.ts") ?? "";
check(
  "FIS-H01-no-refresh-getItem",
  !/localStorage\.getItem\(\s*REFRESH_TOKEN_KEY\s*\)/.test(authStorage) &&
    /getRefreshToken\(\)[\s\S]*?return null/.test(authStorage),
  "getRefreshToken must not read localStorage; must return null",
);
check(
  "FIS-H01-purge-legacy",
  authStorage.includes("purgeLegacyAuthKeys") &&
    authStorage.includes("forge-bearer-token") &&
    /removeItem\(key\)/.test(authStorage),
  "Legacy credential keys must be removeItem-only on startup/logout",
);

const sessionCtrl = read("apps/platform-api/src/modules/auth-context/auth-session.controller.ts");
check(
  "FIS-H01-session-controller",
  Boolean(sessionCtrl?.includes("api/v1/auth/session")),
  "Auth session BFF controller present",
);

const csp = read("infrastructure/cdk/lib/constructs/forge-static-hosting-csp.ts") ?? "";
check(
  "FIS-M01-no-script-unsafe-inline",
  /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp),
  "CSP script-src must not include unsafe-inline",
);
check(
  "FIS-M01-no-bare-https-connect",
  !/connect-src 'self' https:/.test(csp) && csp.includes("connect-src"),
  "CSP connect-src must not be bare https:",
);

const branding = read("apps/platform-api/src/modules/branding/login-branding.public-schema.ts") ?? "";
const brandingDtoShape = branding.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check(
  "FIS-L01-no-tenantId",
  branding.length > 0 &&
    brandingDtoShape.includes("publicLoginBrandingSchema") &&
    !/\btenantId\b/.test(brandingDtoShape),
  "Public login branding schema must omit tenantId",
);

const staticHosting = read("infrastructure/cdk/lib/constructs/forge-static-hosting.ts") ?? "";
check(
  "FIS-L02-legacy-redirect",
  staticHosting.includes("legacyRedirect") || staticHosting.includes("buildLegacyHostRedirectSnippet"),
  "Legacy host redirect snippet wired into static hosting",
);

const matrixPath = "apps/platform-api/src/modules/industrial/industrial-authz-matrix.http.test.ts";
const matrix = read(matrixPath);
check(
  "RG-authz-matrix",
  Boolean(
    matrix &&
      matrix.includes("PermissionGuard") &&
      matrix.includes("authorization matrix"),
  ),
  "Synthetic industrial authz HTTP matrix test present",
);

const cleanup = read("packages/web-kit/src/forge-browser-cleanup.ts");
const indPurge = read("apps/industrial-web/src/lib/forge-browser-purge.ts");
const fieldPurge = read("apps/field-web/src/lib/forge-browser-purge.ts");
check(
  "RG-09-cleanup-registry",
  Boolean(cleanup?.includes("runForgeBrowserCleanup") && indPurge && fieldPurge),
  "Forge browser cleanup registry + industrial/field purge modules present",
);

const rg09Matrix = read("packages/web-kit/src/rg09-browser-cleanup.matrix.test.ts");
check(
  "RG-09-browser-matrix",
  Boolean(rg09Matrix?.includes("XSS scan") && rg09Matrix.includes("tenant-switch")),
  "RG-09 browser cleanup matrix test present",
);

const presentation = read(
  "apps/platform-api/src/modules/industrial/presentation-containment.test.ts",
);
check(
  "RG-10-presentation-containment",
  Boolean(presentation?.includes("DEMO_TENANT_BLOCKED") && presentation.includes("Reset Demo")),
  "Presentation containment contract tests present",
);

const remDoc = read("docs/security/FIS-SEC-AUDIT-001-REMEDIATION.md");
check(
  "evidence-doc",
  Boolean(remDoc?.includes("FORGE-INDUSTRIAL-SEC-REMEDIATION-S1")),
  "Remediation evidence document present",
);

check(
  "RG-01-live-producers",
  false,
  "Live Producers Rice Mill authenticated matrix requires approved credentials — code/synthetic coverage only",
  true,
);

let failed = 0;
for (const row of results) {
  const mark = row.status === "PASS" ? "PASS" : row.status === "REVIEW" ? "REVIEW" : "FAIL";
  console.log(`[${mark}] ${row.id}: ${row.detail}`);
  if (row.status === "FAIL") failed += 1;
}

console.log(`\n${results.length} checks, ${failed} FAIL, ${results.filter((r) => r.status === "REVIEW").length} REVIEW`);
process.exit(failed > 0 ? 1 : 0);
