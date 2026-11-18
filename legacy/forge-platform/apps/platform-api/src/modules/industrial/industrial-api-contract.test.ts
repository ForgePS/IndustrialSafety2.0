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
  "form-submissions",
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
  "fleet/vehicles",
  "fleet/dashboard",
];

describe("Industrial Model A API contract", () => {
  it("flat controller implements required frontend routes", () => {
    const controller = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial-flat.controller.ts"),
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
    expect(service).toContain("enableWcMedicalAccess");
    expect(service).toContain("listWorkersCompMedical");
    expect(service).toContain("app.industrial_wc_medical_access");
  });

  it("exposes WC medical GET and child archive routes", () => {
    const controller = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial-flat.controller.ts"),
      "utf8",
    );
    expect(controller).toContain('@Get("workers-comp/:id/medical")');
    expect(controller).toContain('@Get("workers-comp/:id/printable")');
    expect(controller).toContain('@Post("workers-comp/:id/work-status")');
    expect(controller).toContain('@Delete("workers-comp/:id/work-status/:periodId")');
    expect(controller).toContain('@Delete("workers-comp/:id/restrictions/:restrictionId")');
    expect(controller).toContain("industrial.workers_comp.medical.view");
  });

  it("registers the training controller before the flat catch-all controller", () => {
    // IndustrialFlatController owns `:module/:id`, which would otherwise swallow
    // GET /industrial/training/records (module=training, id=records) and 404 as
    // "Record not found". Nest registers routes in controller-array order, so the
    // training controller must come first for its LMS routes to win.
    const module = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial.module.ts"),
      "utf8",
    );
    const trainingIdx = module.indexOf("IndustrialTrainingController");
    const flatIdx = module.indexOf("IndustrialFlatController");
    expect(trainingIdx).toBeGreaterThanOrEqual(0);
    expect(flatIdx).toBeGreaterThanOrEqual(0);
    // Compare positions within the `controllers: [...]` registration array.
    const controllersArray = module.slice(
      module.indexOf("controllers:"),
      module.indexOf("providers:"),
    );
    expect(controllersArray.indexOf("IndustrialTrainingController")).toBeLessThan(
      controllersArray.indexOf("IndustrialFlatController"),
    );
  });

  it("registers the emergency-alerts controller before the flat catch-all controller", () => {
    const module = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial.module.ts"),
      "utf8",
    );
    const controllersArray = module.slice(
      module.indexOf("controllers:"),
      module.indexOf("providers:"),
    );
    expect(controllersArray.indexOf("IndustrialEmergencyAlertsController")).toBeGreaterThanOrEqual(
      0,
    );
    expect(controllersArray.indexOf("IndustrialEmergencyAlertsController")).toBeLessThan(
      controllersArray.indexOf("IndustrialFlatController"),
    );
  });

  it("registers the document-control controller before the flat catch-all controller", () => {
    const module = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial.module.ts"),
      "utf8",
    );
    const controllersArray = module.slice(
      module.indexOf("controllers:"),
      module.indexOf("providers:"),
    );
    expect(controllersArray.indexOf("IndustrialDocumentControlController")).toBeGreaterThanOrEqual(
      0,
    );
    expect(controllersArray.indexOf("IndustrialDocumentControlController")).toBeLessThan(
      controllersArray.indexOf("IndustrialFlatController"),
    );
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

  it("exposes public training portal session routes", () => {
    const controller = readFileSync(
      path.join(
        ROOT,
        "apps/platform-api/src/modules/industrial/industrial-public-training.controller.ts",
      ),
      "utf8",
    );
    expect(controller).toContain('@Post("training/:token/session/resume")');
    expect(controller).toContain('@Post("training/:token/session/logout")');
    expect(controller).toContain('@Get("training/access/:token")');
    expect(controller).toContain('@Post("training/access/:token/verify")');
    expect(controller).toContain("sessionToken");
  });

  it("defines LMS portal tables in industrial schema", () => {
    const schema = readFileSync(
      path.join(ROOT, "packages/database/src/schema/industrial.ts"),
      "utf8",
    );
    expect(schema).toContain("industrialTrainingPortalSessions");
    expect(schema).toContain("industrialTrainingAccessLinks");
    expect(schema).toContain("industrialTrainingCompletions");
    expect(schema).toContain("industrialTrainingCourseVersions");
    expect(schema).toContain("industrialTrainingProgress");
  });
});
