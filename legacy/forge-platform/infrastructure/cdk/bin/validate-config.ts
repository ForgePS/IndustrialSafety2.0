#!/usr/bin/env node
import { resolveConfig } from "../lib/config/environment-config.js";
import { validateEnvironmentConfig } from "../lib/config/environment-schema.js";

const name = process.env.FORGE_ENV || "development";

try {
  const config = resolveConfig(name);
  // Re-validate to surface Zod errors clearly for CI.
  validateEnvironmentConfig(config);
  console.warn(
    JSON.stringify(
      {
        ok: true,
        environmentName: config.environmentName,
        costProfile: config.costProfile,
        partition: config.partition,
        account: config.account,
        region: config.region,
        vpcCidr: config.networking.vpcCidr,
        monthlyBudgetUsd: config.features.monthlyBudgetUsd,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Environment configuration validation failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
