import type { ForgeEnvironmentConfig } from "./environment-schema.js";
import { validateEnvironmentConfig } from "./environment-schema.js";
import { developerCostProfile } from "./cost-profile.js";

function resolveAccount(): string {
  return process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID || "000000000000";
}

function resolveRegion(): string {
  return process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1";
}

const { knobs } = developerCostProfile;

/** Single-account commercial development baseline — Developer cost profile (~$50–80/mo). */
export const developmentConfig: ForgeEnvironmentConfig = validateEnvironmentConfig({
  environmentName: "development",
  costProfile: "developer",
  partition: "aws",
  account: resolveAccount(),
  region: resolveRegion(),
  secondaryRegion: "us-west-2",
  projectName: "forge-platform",
  networking: {
    vpcCidr: "10.20.0.0/16",
    ...knobs.networking,
  },
  database: {
    engineVersion: "15.10",
    ...knobs.database,
    // GAP-009: secret forge-*-secrets-database-app already exists; do not create.
    importExistingAppSecret: true,
  },
  retention: knobs.retention,
  compute: knobs.compute,
  features: knobs.features,
  // HTTPS stays off until a Route 53 hosted zone is delegated externally.
  edge: {
    enableHttps: false,
    apiHostname: "api-dev.forgepublicsafety.com",
    consoleHostname: "console-dev.forgepublicsafety.com",
  },
  domains: {
    api: "api-dev.forgepublicsafety.com",
    creator: "console-dev.forgepublicsafety.com",
    rms: "rms-dev.forgepublicsafety.com",
    // Keeps existing Development Industrial CloudFront construct (no ACM alias until HTTPS edge).
    industrial: "industrial-dev.forgepublicsafety.com",
  },
  cognito: {
    callbackUrls: [
      "http://localhost:3001/auth/callback/",
      "http://localhost:3002/auth/callback/",
      "http://localhost:3003/auth/callback/",
      "http://localhost:3004/auth/callback/",
      "http://localhost:3005/auth/callback/",
      // Deployed RMS CloudFront (Phase 2 acceptance). Update if distribution is replaced.
      "https://d3ud5uzwd9js2z.cloudfront.net/auth/callback/",
      // Deployed Field CloudFront (Forge-Development-FieldFrontend).
      "https://dr716wyn2h1dm.cloudfront.net/auth/callback/",
    ],
    logoutUrls: [
      "http://localhost:3001/",
      "http://localhost:3002/",
      "http://localhost:3003/",
      "http://localhost:3004/",
      "http://localhost:3005/",
      "https://d3ud5uzwd9js2z.cloudfront.net/",
      "https://dr716wyn2h1dm.cloudfront.net/",
    ],
    selfSignUpEnabled: false,
  },
});
