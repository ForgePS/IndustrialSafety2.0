import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDUSTRIAL_MODULE_REGISTRY } from "@forge/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Frontend-expected Industrial flat routes that must exist on platform-api. */
const REQUIRED_FLAT_ROUTES = [
  "bootstrap",
  "readiness",
  "dashboard",
  "analytics/overview",
  "personnel",
  "sites",
  "equipment",
  "incidents",
  "inspections",
  "observations",
  "jsas",
  "loto",
  "training",
  "forms",
  "tasks",
  "workers-comp",
  "dot",
  "confined-space",
  "hot-work",
  "working-at-heights",
  "electrical-safety",
  "cranes-rigging",
  "machine-safety",
  "forklifts",
  "osha",
  "risk",
  "chemical-safety",
  "corrective-actions",
  "training/bulk",
];

describe("Industrial Model A API contract", () => {
  it("flat controller implements required frontend routes", () => {
    const controller = readFileSync(
      path.join(
        ROOT,
        "apps/platform-api/src/modules/industrial/industrial-flat.controller.ts",
      ),
      "utf8",
    );
    expect(controller).toContain('@Controller("api/v1/industrial")');
    expect(controller).not.toContain("industrial_ops_records");
    for (const route of REQUIRED_FLAT_ROUTES) {
      // Route may be explicit or covered by :module generic handler + MODULE_VIEW
      const covered =
        controller.includes(`"${route}"`) ||
        controller.includes(`'${route}'`) ||
        (route.includes("/")
          ? controller.includes(route.split("/")[0]!)
          : controller.includes(":module"));
      expect(covered, `missing coverage for ${route}`).toBe(true);
    }
  });

  it("domain service never references Model B ops records", () => {
    const service = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial-domain.service.ts"),
      "utf8",
    );
    expect(service).not.toMatch(/from\(["']industrial_ops_records["']\)/);
    expect(service.toLowerCase()).not.toContain("ops_records");
    expect(service).toContain("industrialTrainingRecords");
    expect(service).toContain("industrialWorkersCompCases");
    expect(service).toContain("analyticsOverview");
    expect(service).toContain("bulkTraining");
  });

  it("analytics module is AVAILABLE (not LEGACY_ONLY)", () => {
    const analytics = INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === "ANALYTICS");
    expect(analytics?.implementationStatus).toBe("AVAILABLE");
  });

  it("Drizzle exports Model A module tables used by flat API", () => {
    const schema = readFileSync(
      path.join(ROOT, "packages/database/src/schema/industrial-module-tables.ts"),
      "utf8",
    );
    for (const table of [
      "industrial_training_records",
      "industrial_form_definitions",
      "industrial_confined_space_records",
      "industrial_dot_compliance_records",
      "industrial_tasks",
      "industrial_loto_energy_sources",
    ]) {
      expect(schema).toContain(table);
    }
  });
});
