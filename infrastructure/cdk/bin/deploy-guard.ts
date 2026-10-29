#!/usr/bin/env node
/**
 * Production deployment guard (MK-S23 / PROD-S0R).
 * Refuses unsafe production CDK deploys before any CloudFormation mutation.
 *
 * Usage:
 *   FORGE_ENV=production FORGE_PRODUCTION_ACCOUNT=511343547817 \
 *   FORGE_CONFIRM_PRODUCTION_DEPLOY=YES pnpm --filter @forge/infrastructure-cdk deploy
 */
import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";
import { APPROVED_PRODUCTION_ACCOUNT, createProductionConfig } from "../lib/config/production.js";
import { resolveConfig } from "../lib/config/environment-config.js";

export interface DeployGuardInput {
  forgeEnv?: string;
  productionAccount?: string;
  confirmProductionDeploy?: string;
  callerIdentityAccount?: string | null;
  gitStatusPorcelain?: string;
  requireCleanWorktree?: boolean;
  cdkArgs?: string[];
}

export interface DeployGuardResult {
  ok: true;
  environmentName: string;
  account: string;
  stackPrefix: string;
}

export class DeployGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployGuardError";
  }
}

function looksLikeExampleHost(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes("example.com") || value.includes("000000000000");
}

/**
 * Evaluate whether a production (or protected) deploy may proceed.
 * Throws DeployGuardError on any violation.
 */
export function assertDeployAllowed(input: DeployGuardInput = {}): DeployGuardResult {
  const forgeEnv = (input.forgeEnv ?? process.env.FORGE_ENV ?? "development").trim();
  const confirm =
    input.confirmProductionDeploy ?? process.env.FORGE_CONFIRM_PRODUCTION_DEPLOY ?? "";
  const requireClean =
    input.requireCleanWorktree ??
    (process.env.FORGE_REQUIRE_CLEAN_WORKTREE === "1" || forgeEnv === "production");

  if (forgeEnv !== "production" && forgeEnv !== "govcloud-production") {
    // Non-production deploys are allowed without the production confirm flag.
    return {
      ok: true,
      environmentName: forgeEnv,
      account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID || "unknown",
      stackPrefix: `Forge-${forgeEnv.charAt(0).toUpperCase()}${forgeEnv.slice(1)}-`,
    };
  }

  if (confirm !== "YES") {
    throw new DeployGuardError(
      `Refusing production deploy: set FORGE_CONFIRM_PRODUCTION_DEPLOY=YES (FORGE_ENV=${forgeEnv})`,
    );
  }

  const accountFromEnv =
    input.productionAccount?.trim() || process.env.FORGE_PRODUCTION_ACCOUNT?.trim();
  if (!accountFromEnv) {
    throw new DeployGuardError("FORGE_PRODUCTION_ACCOUNT is required for production deploy");
  }
  if (accountFromEnv !== APPROVED_PRODUCTION_ACCOUNT) {
    throw new DeployGuardError(
      `FORGE_PRODUCTION_ACCOUNT ${accountFromEnv} does not match approved ${APPROVED_PRODUCTION_ACCOUNT}`,
    );
  }

  // Fail-closed config load (rejects placeholders / example.com).
  const config = createProductionConfig({
    ...process.env,
    FORGE_PRODUCTION_ACCOUNT: accountFromEnv,
  });

  if (config.environmentName !== "production" && config.environmentName !== "govcloud-production") {
    throw new DeployGuardError(
      `Resolved environmentName must be production (got ${config.environmentName})`,
    );
  }

  for (const key of ["api", "creator", "rms", "industrial", "tenantAdmin"] as const) {
    if (looksLikeExampleHost(config.domains?.[key])) {
      throw new DeployGuardError(`Production domain ${key} is missing or uses a placeholder`);
    }
  }

  for (const url of [...config.cognito.callbackUrls, ...config.cognito.logoutUrls]) {
    if (url.includes("example.com") || url.includes("localhost")) {
      throw new DeployGuardError(`Cognito URL still contains placeholder/localhost: ${url}`);
    }
  }

  const callerAccount =
    input.callerIdentityAccount === undefined ? readCallerAccount() : input.callerIdentityAccount;
  if (!callerAccount) {
    throw new DeployGuardError(
      "Unable to resolve AWS caller account (aws sts get-caller-identity)",
    );
  }
  if (callerAccount !== APPROVED_PRODUCTION_ACCOUNT) {
    throw new DeployGuardError(
      `Caller AWS account ${callerAccount} does not match approved production account ${APPROVED_PRODUCTION_ACCOUNT}`,
    );
  }
  if (callerAccount !== config.account) {
    throw new DeployGuardError(
      `Caller account ${callerAccount} does not match config.account ${config.account}`,
    );
  }

  const expectedPrefix = "Forge-Production-";
  // Guard against accidental Development targeting via mis-set FORGE_ENV after resolve.
  const resolved = resolveConfig(forgeEnv);
  if (resolved.environmentName === "development" || expectedPrefix.includes("Development")) {
    // intentional no-op; check stack naming expectation separately
  }
  if (
    resolved.environmentName !== "production" &&
    resolved.environmentName !== "govcloud-production"
  ) {
    throw new DeployGuardError(
      `Refusing deploy: FORGE_ENV resolves to ${resolved.environmentName}, not production`,
    );
  }

  if (requireClean) {
    const porcelain =
      input.gitStatusPorcelain === undefined ? readGitPorcelain() : input.gitStatusPorcelain;
    if (porcelain.trim().length > 0) {
      throw new DeployGuardError(
        "Refusing production deploy with a dirty worktree (set FORGE_REQUIRE_CLEAN_WORKTREE=0 to override intentionally)",
      );
    }
  }

  // Database target presence: Aurora cluster is created by Data stack; require VPC CIDR + engine.
  if (!config.networking.vpcCidr || !config.database.engineVersion) {
    throw new DeployGuardError("Production database target configuration is incomplete");
  }
  if (!config.database.deletionProtection) {
    throw new DeployGuardError("Production database deletion protection must be enabled");
  }

  return {
    ok: true,
    environmentName: config.environmentName,
    account: config.account,
    stackPrefix: expectedPrefix,
  };
}

function readCallerAccount(): string | null {
  try {
    const out = execSync("aws sts get-caller-identity --query Account --output text", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return /^\d{12}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

function readGitPorcelain(): string {
  try {
    return execSync("git status --porcelain", { encoding: "utf8" });
  } catch {
    return "?? unable-to-read-git-status";
  }
}

function main(): void {
  try {
    const result = assertDeployAllowed();
    console.warn(
      JSON.stringify(
        {
          message: "Production deploy guard passed",
          ...result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof DeployGuardError ? error.message : error);
    process.exit(1);
  }

  const cdkArgs = process.argv.slice(2);
  const args = cdkArgs.length > 0 ? cdkArgs : ["deploy", "--all", "--require-approval", "never"];
  const result = spawnSync("npx", ["cdk", ...args], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      FORGE_ENV: process.env.FORGE_ENV || "production",
    },
  });
  process.exit(result.status ?? 1);
}

const isMain = process.argv[1]?.includes("deploy-guard");
if (isMain) {
  main();
}
