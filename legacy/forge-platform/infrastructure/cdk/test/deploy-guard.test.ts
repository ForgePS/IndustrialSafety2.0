import { describe, expect, it } from "vitest";
import {
  assertDeployAllowed,
  assertProductionStacksAllowed,
  DeployGuardError,
} from "../bin/deploy-guard.js";
import { APPROVED_PRODUCTION_ACCOUNT } from "../lib/config/production.js";

describe("production deploy guard", () => {
  const base = {
    forgeEnv: "production",
    productionAccount: APPROVED_PRODUCTION_ACCOUNT,
    confirmProductionDeploy: "YES",
    callerIdentityAccount: APPROVED_PRODUCTION_ACCOUNT,
    gitStatusPorcelain: "",
    requireCleanWorktree: true,
  };

  it("allows a clean production deploy with matching account", () => {
    const result = assertDeployAllowed(base);
    expect(result.ok).toBe(true);
    expect(result.account).toBe(APPROVED_PRODUCTION_ACCOUNT);
    expect(result.stackPrefix).toBe("Forge-Production-");
  });

  it("refuses without FORGE_CONFIRM_PRODUCTION_DEPLOY=YES", () => {
    expect(() => assertDeployAllowed({ ...base, confirmProductionDeploy: "" })).toThrow(
      DeployGuardError,
    );
  });

  it("refuses mismatched production account", () => {
    expect(() => assertDeployAllowed({ ...base, productionAccount: "999999999999" })).toThrow(
      /approved/,
    );
  });

  it("refuses mismatched caller identity", () => {
    expect(() => assertDeployAllowed({ ...base, callerIdentityAccount: "111111111111" })).toThrow(
      /Caller AWS account/,
    );
  });

  it("refuses dirty worktree for production", () => {
    expect(() => assertDeployAllowed({ ...base, gitStatusPorcelain: " M README.md\n" })).toThrow(
      /dirty worktree/,
    );
  });

  it("allows development without production confirm", () => {
    const result = assertDeployAllowed({
      forgeEnv: "development",
      confirmProductionDeploy: "",
    });
    expect(result.ok).toBe(true);
    expect(result.environmentName).toBe("development");
  });
});

describe("production stack allowlist", () => {
  const ok = (...a: string[]) => assertProductionStacksAllowed(a, undefined);

  it("allows a named safe stack with --exclusively", () => {
    expect(ok("deploy", "ForgeData", "--exclusively", "--require-approval", "never")).toEqual([
      "ForgeData",
    ]);
    expect(ok("deploy", "Forge-Production-Identity", "-e")).toEqual(["ForgeIdentity"]);
  });

  it("refuses --all and the implicit default", () => {
    expect(() => ok("deploy", "--all")).toThrow(/--all/);
    expect(() => assertProductionStacksAllowed([], undefined)).toThrow(/--all/);
  });

  it("refuses deploys with no stack names (flag values are not stack names)", () => {
    expect(() => ok("deploy", "--exclusively", "--require-approval", "never")).toThrow(
      /explicit stack names/,
    );
  });

  it("refuses without --exclusively", () => {
    expect(() => ok("deploy", "ForgeData")).toThrow(/--exclusively/);
  });

  it("refuses drifted stacks and wildcards", () => {
    expect(() => ok("deploy", "ForgeCompute", "--exclusively")).toThrow(/drifted/);
    expect(() => ok("deploy", "Forge-Production-*", "--exclusively")).toThrow(/wildcard/);
  });

  it("allows one drifted stack only with an explicit override for that stack", () => {
    expect(
      assertProductionStacksAllowed(["deploy", "ForgeCompute", "--exclusively"], "ForgeCompute"),
    ).toEqual(["ForgeCompute"]);
    expect(() =>
      assertProductionStacksAllowed(["deploy", "ForgeFrontend", "--exclusively"], "ForgeCompute"),
    ).toThrow(/drifted/);
  });

  it("does not interfere with non-deploy commands", () => {
    expect(ok("diff", "--all")).toEqual([]);
  });
});
