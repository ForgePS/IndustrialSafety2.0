import { developmentConfig } from "./development.js";
import { testingConfig } from "./testing.js";
import { stagingConfig } from "./staging.js";
import { productionConfig } from "./production.js";
import { govcloudDevelopmentConfig } from "./govcloud.js";
import type { ForgeEnvironmentConfig } from "./environment-schema.js";

export * from "./environment-schema.js";
export * from "./cost-profile.js";
export {
  developmentConfig,
  testingConfig,
  stagingConfig,
  productionConfig,
  govcloudDevelopmentConfig,
};

export function resolveConfig(
  name = process.env.FORGE_ENV || "development",
): ForgeEnvironmentConfig {
  switch (name) {
    case "development":
      return developmentConfig;
    case "testing":
      return testingConfig;
    case "staging":
      return stagingConfig;
    case "production":
      return productionConfig;
    case "govcloud-development":
      return govcloudDevelopmentConfig;
    default:
      throw new Error(`Unsupported FORGE_ENV=${name}`);
  }
}
