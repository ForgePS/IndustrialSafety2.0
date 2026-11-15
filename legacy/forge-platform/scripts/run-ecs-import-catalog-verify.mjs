#!/usr/bin/env node
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
  ["node", "/app/packages/database/dist/import-catalog-verify-ecs.js"],
  "import-catalog-verify",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);
