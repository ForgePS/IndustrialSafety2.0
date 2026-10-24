import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export type E2eCredentials = {
  username: string;
  password: string;
};

export function getBaseUrl(): string {
  return (process.env.E2E_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

export function getApiUrl(): string {
  return (process.env.E2E_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export function getStorageStatePath(): string | undefined {
  const configured = process.env.E2E_STORAGE_STATE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(packageRoot, "..", configured);
  }
  return path.resolve(packageRoot, "..", ".auth", "storage-state.json");
}

export function hasPrimaryCredentials(): boolean {
  return Boolean(
    process.env.E2E_COGNITO_USERNAME?.trim() && process.env.E2E_COGNITO_PASSWORD?.trim(),
  );
}

export function getPrimaryCredentials(): E2eCredentials {
  const username = process.env.E2E_COGNITO_USERNAME?.trim();
  const password = process.env.E2E_COGNITO_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("E2E_COGNITO_USERNAME and E2E_COGNITO_PASSWORD are required");
  }
  return { username, password };
}

export function hasSecondaryCredentials(): boolean {
  return Boolean(
    process.env.E2E_COGNITO_USERNAME_2?.trim() && process.env.E2E_COGNITO_PASSWORD_2?.trim(),
  );
}

export function getSecondaryCredentials(): E2eCredentials {
  const username = process.env.E2E_COGNITO_USERNAME_2?.trim();
  const password = process.env.E2E_COGNITO_PASSWORD_2?.trim();
  if (!username || !password) {
    throw new Error("E2E_COGNITO_USERNAME_2 and E2E_COGNITO_PASSWORD_2 are required");
  }
  return { username, password };
}

export const SKIP_NO_CREDENTIALS =
  "Skipped: set E2E_COGNITO_USERNAME and E2E_COGNITO_PASSWORD to run against a deployed environment.";

export const SKIP_NO_SECONDARY =
  "Skipped: set E2E_COGNITO_USERNAME_2 and E2E_COGNITO_PASSWORD_2 for cross-tenant isolation tests.";

export const REQUIRE_SECONDARY =
  "Cross-tenant isolation requires E2E_COGNITO_USERNAME_2 and E2E_COGNITO_PASSWORD_2 (secondary Cognito user).";
