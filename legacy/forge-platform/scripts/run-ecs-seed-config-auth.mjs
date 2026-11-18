#!/usr/bin/env node
/**
 * Seed Configuration Platform auth personas (forge_admin).
 */
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const adminSecretName =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-development-secrets-database";
const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/seed-config-auth-personas.js"],
  "seed-config-auth-personas",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);
