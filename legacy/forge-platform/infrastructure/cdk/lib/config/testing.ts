import type { ForgeEnvironmentConfig } from "./environment-schema.js";
import { validateEnvironmentConfig } from "./environment-schema.js";
import { integrationCostProfile } from "./cost-profile.js";

const { knobs } = integrationCostProfile;

/** Template for future testing environment — Integration cost profile (~$100–150/mo). */
export const testingConfig: ForgeEnvironmentConfig = validateEnvironmentConfig({
  environmentName: "testing",
  costProfile: "integration",
  partition: "aws",
  account: process.env.FORGE_TESTING_ACCOUNT || "000000000000",
  region: "us-east-1",
  projectName: "forge-platform",
  networking: {
    vpcCidr: "10.30.0.0/16",
    ...knobs.networking,
  },
  database: {
    engineVersion: "15.10",
    ...knobs.database,
  },
  retention: knobs.retention,
  compute: knobs.compute,
  features: knobs.features,
  cognito: {
    callbackUrls: ["https://test-academy.example.com/api/auth/callback"],
    logoutUrls: ["https://test-academy.example.com"],
    selfSignUpEnabled: false,
  },
});
