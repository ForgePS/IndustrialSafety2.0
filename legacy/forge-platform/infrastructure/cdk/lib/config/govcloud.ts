import type { ForgeEnvironmentConfig } from "./environment-schema.js";
import { validateEnvironmentConfig } from "./environment-schema.js";
import { developerCostProfile } from "./cost-profile.js";

const { knobs } = developerCostProfile;

/** GovCloud templates for future use — Developer cost profile (~$50–80/mo). */
export const govcloudDevelopmentConfig: ForgeEnvironmentConfig = validateEnvironmentConfig({
  environmentName: "govcloud-development",
  costProfile: "developer",
  partition: "aws-us-gov",
  account: process.env.FORGE_GOVCLOUD_DEV_ACCOUNT || "000000000000",
  region: "us-gov-west-1",
  projectName: "forge-platform",
  networking: {
    vpcCidr: "10.60.0.0/16",
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
    callbackUrls: ["https://gov-dev-academy.example.com/api/auth/callback"],
    logoutUrls: ["https://gov-dev-academy.example.com"],
    selfSignUpEnabled: false,
  },
});
