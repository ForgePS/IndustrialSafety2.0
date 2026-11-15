import type { ForgeEnvironmentConfig } from "./environment-schema.js";
import { validateEnvironmentConfig } from "./environment-schema.js";
import { integrationCostProfile } from "./cost-profile.js";

const { knobs } = integrationCostProfile;

/**
 * Pre-production staging — Integration cost profile (~$100–150/mo) with
 * slightly higher capacity ceilings for release rehearsal.
 */
export const stagingConfig: ForgeEnvironmentConfig = validateEnvironmentConfig({
  environmentName: "staging",
  costProfile: "integration",
  partition: "aws",
  account: process.env.FORGE_STAGING_ACCOUNT || "000000000000",
  region: "us-east-1",
  projectName: "forge-platform",
  networking: {
    vpcCidr: "10.40.0.0/16",
    ...knobs.networking,
    // Staging keeps a second NAT for failover rehearsal without jumping to production cost.
    natGatewayCount: 2,
  },
  database: {
    engineVersion: "15.10",
    ...knobs.database,
    serverlessMaxCapacity: 8,
    backupRetentionDays: 14,
    deletionProtection: true,
    multiAz: true,
  },
  retention: {
    ...knobs.retention,
    applicationLogsDays: 60,
    auditLogsDays: 730,
    importFilesDays: 45,
    exportFilesDays: 30,
  },
  compute: {
    apiDesiredCount: 2,
    workerDesiredCount: 1,
  },
  features: {
    ...knobs.features,
    enableGuardDuty: true,
    enableSecurityHub: true,
    monthlyBudgetUsd: 800,
  },
  cognito: {
    callbackUrls: ["https://staging-academy.example.com/api/auth/callback"],
    logoutUrls: ["https://staging-academy.example.com"],
    selfSignUpEnabled: false,
  },
});
