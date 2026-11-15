import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("company driver roster wiring", () => {
  it("syncs personnel isCompanyDriver to the fleet drivers roster", () => {
    const domain = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/industrial-domain.service.ts"),
      "utf8",
    );
    const roster = readFileSync(
      path.join(ROOT, "apps/platform-api/src/modules/industrial/company-driver-roster.ts"),
      "utf8",
    );
    expect(roster).toContain("ensureCompanyDriverRosterEntry");
    expect(domain).toContain("ensureCompanyDriverRosterEntry");
    expect(domain).toContain("personnel_is_company_driver");
  });
});
