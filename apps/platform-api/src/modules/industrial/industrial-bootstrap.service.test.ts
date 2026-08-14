import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndustrialBootstrapService } from "./industrial-bootstrap.service.js";

function principal(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    isPlatformAdmin: false,
    permissions: new Set(["industrial.access"]),
    activeProducts: new Set(["FORGE_INDUSTRIAL"]),
    ...overrides,
  } as never;
}

describe("IndustrialBootstrapService", () => {
  const flags = { effective: vi.fn() };
  let service: IndustrialBootstrapService;

  beforeEach(() => {
    flags.effective.mockReset();
    flags.effective.mockResolvedValue([
      { key: "industrial.enabled", value: true },
      { key: "industrial.module.personnel.enabled", value: true },
      { key: "industrial.module.loto.enabled", value: true },
    ]);
    service = new IndustrialBootstrapService(flags as never);
  });

  it("returns CORE awsEnabled when industrial.enabled", async () => {
    const result = await service.bootstrap(principal());
    const core = result.modules.find((m) => m.code === "CORE");
    expect(core?.awsEnabled).toBe(true);
    expect(result.industrialEnabled).toBe(true);
  });

  it("maps LOCKOUT_TAGOUT to industrial.module.loto.enabled", async () => {
    const result = await service.bootstrap(principal());
    const loto = result.modules.find((m) => m.code === "LOCKOUT_TAGOUT");
    expect(loto?.featureFlagKey).toBe("industrial.module.loto.enabled");
    expect(loto?.awsEnabled).toBe(true);
  });

  it("enables AVAILABLE modules by default when no flag overrides exist (entitlements govern)", async () => {
    // Production regression: tenant with zero industrial feature overrides.
    flags.effective.mockResolvedValue([]);
    const result = await service.bootstrap(principal());
    expect(result.industrialEnabled).toBe(true);
    expect(result.modules.every((m) => m.awsEnabled)).toBe(true);
  });

  it("keeps AVAILABLE module ON when definition default is off but no explicit override", async () => {
    flags.effective.mockResolvedValue([
      { key: "industrial.enabled", value: false, overridden: false },
      { key: "industrial.module.loto.enabled", value: false, overridden: false },
    ]);
    const result = await service.bootstrap(principal());
    const loto = result.modules.find((m) => m.code === "LOCKOUT_TAGOUT");
    expect(result.industrialEnabled).toBe(true);
    expect(loto?.awsEnabled).toBe(true);
  });

  it("disables an AVAILABLE module only when an explicit override turns it off", async () => {
    flags.effective.mockResolvedValue([
      { key: "industrial.module.loto.enabled", value: false, overridden: true },
      { key: "industrial.module.personnel.enabled", value: true, overridden: true },
    ]);
    const result = await service.bootstrap(principal());
    const loto = result.modules.find((m) => m.code === "LOCKOUT_TAGOUT");
    const personnel = result.modules.find((m) => m.code === "PERSONNEL");
    expect(loto?.awsEnabled).toBe(false);
    expect(personnel?.awsEnabled).toBe(true);
  });
});
