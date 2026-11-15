import { validateEnvironmentConfig } from "../config/environment-schema.js";

export function assertValidCidr(cidr: string): void {
  const match = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.exec(cidr);
  if (!match) {
    throw new Error(`Invalid VPC CIDR: ${cidr}`);
  }
}

export function assertConfig(input: unknown) {
  return validateEnvironmentConfig(input);
}
