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
  ["node", "/app/packages/database/dist/seed-import-acceptance-tenants.js"],
  "seed-import-acceptance-tenants",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);
