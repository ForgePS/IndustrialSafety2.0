import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("Industrial fleet module wiring", () => {
  it("registers fleet service and flat vehicle routes", () => {
    const mod = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial.module.ts"),
      "utf8",
    );
    const controller = readFileSync(
      path.join(
        ROOT,
        "apps/platform-api/src/modules/industrial/industrial-flat.controller.ts",
      ),
      "utf8",
    );
    const service = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial-fleet.service.ts"),
      "utf8",
    );
    expect(mod).toContain("IndustrialFleetService");
    expect(controller).toContain('@Get("fleet/vehicles")');
    expect(controller).toContain('@Patch("fleet/vehicles/:id")');
    expect(controller).toContain('@Post("fleet/vehicles/:id/assign")');
    expect(service).toContain("withTenantTransaction");
    expect(service).toContain("industrialFleetVehicles");
    expect(service).toContain("ensureCompanyDriverFromAssignment");
    expect(service).toContain("isCompanyDriver");
  });

  it("keeps fleet migration and discovery artifacts", () => {
    const migration = readFileSync(
      path.join(
        ROOT,
        "packages/database/drizzle/0046_industrial_fleet_module_s1.sql",
      ),
      "utf8",
    );
    const discovery = readFileSync(
      path.join(ROOT, "docs/industrial/fleet-s0-discovery.md"),
      "utf8",
    );
    expect(migration).toContain("industrial_fleet_assignment_history");
    expect(discovery).toContain("producers-rice-mill");
  });
});
