#!/usr/bin/env node
/**
 * Seed Producers vanity hosts → production tenant via ECS one-off.
 *
 *   node scripts/run-ecs-seed-producers-domain.mjs
 */
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const adminSecretName =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

if (!adminSecretArn.includes("secrets-database") || adminSecretArn.includes("database-app")) {
  throw new Error(`Refusing seed with non-admin secret ARN: ${adminSecretArn}`);
}

runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/seed-producers-domain-ecs.js"],
  "seed-producers-domain",
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
    },
  },
);
