import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDUSTRIAL_MODULE_REGISTRY } from "@forge/contracts";
import { describe, expect, it } from "vitest";
import { isInd3OpsModule } from "./ops-modules";
import { isInd5HighRiskModule } from "./high-risk-modules";
import { isInd6ComplianceModule } from "./compliance-modules";
import { isInd7CoordinationModule } from "./coordination-modules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PAGE = path.resolve(HERE, "../app/modules/[module]/page.tsx");

/**
 * Registry routes are what navigation links to. A slug the module page does not
 * handle falls through to <ModuleUnavailable/>, so an entitled, fully built
 * module can still read as unavailable purely from a slug mismatch. This is
 * what happened to LOCKOUT_TAGOUT: the registry routes to /modules/lockout-tagout
 * while the page only matched the shorter "loto" slug.
 */
const KNOWN_WITHOUT_WORKSPACE = new Set(["SCAN", "CORRECTIVE_ACTIONS"]);

/** Slugs the module page dispatches on directly, read from the source. */
function explicitSlugs(): Set<string> {
  const page = readFileSync(MODULE_PAGE, "utf8");
  const slugs = new Set<string>();
  for (const m of page.matchAll(/module === "([a-z0-9-]+)"/g)) {
    slugs.add(m[1]!);
  }
  return slugs;
}

function isRoutable(slug: string, explicit: Set<string>): boolean {
  return (
    explicit.has(slug) ||
    isInd3OpsModule(slug) ||
    isInd5HighRiskModule(slug) ||
    isInd6ComplianceModule(slug) ||
    isInd7CoordinationModule(slug)
  );
}

describe("module route coverage", () => {
  const explicit = explicitSlugs();
  const routed = INDUSTRIAL_MODULE_REGISTRY.filter(
    (m) => m.route.startsWith("/modules/") && !KNOWN_WITHOUT_WORKSPACE.has(m.code),
  );

  it("finds the page's explicit slug dispatches", () => {
    expect(explicit.size).toBeGreaterThan(0);
  });

  it.each(routed.map((m) => [m.code, m.route.replace("/modules/", "")] as const))(
    "%s routes its registry slug %s to a workspace",
    (_code, slug) => {
      expect(isRoutable(slug, explicit)).toBe(true);
    },
  );

  it("keeps the lockout-tagout registry slug routable", () => {
    const loto = INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === "LOCKOUT_TAGOUT");
    expect(loto?.route).toBe("/modules/lockout-tagout");
    expect(isRoutable("lockout-tagout", explicit)).toBe(true);
  });
});
