import { describe, expect, it } from "vitest";
import { assertDeployAllowed, DeployGuardError } from "../bin/deploy-guard.js";
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
