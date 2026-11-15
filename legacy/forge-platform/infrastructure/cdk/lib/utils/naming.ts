import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";

export function resourceName(
  config: ForgeEnvironmentConfig,
  service: string,
  purpose: string,
): string {
  return `forge-${config.environmentName}-${service}-${purpose}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

export function uniqueBucketName(config: ForgeEnvironmentConfig, purpose: string): string {
  return `forge-${config.environmentName}-${purpose}-${config.account}-${config.region}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

export function stackName(config: ForgeEnvironmentConfig, layer: string): string {
  return `Forge-${capitalize(config.environmentName)}-${capitalize(layer)}`;
}

function capitalize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
