#!/usr/bin/env node
/**
 * Production deploy: Workers Comp Weekly updates tab + API + migration 0102.
 * 1) Build @forge/contracts
 * 2) Build/push platform-api
 * 3) Roll ECS + apply migration 0102_industrial_wc_weekly_updates_s1
 * 4) Sync industrial-web
 *
 * Usage: node scripts/deploy-production-wc-weekly-updates.mjs
 *        node scripts/deploy-production-wc-weekly-updates.mjs --skip-web
 *        node scripts/deploy-production-wc-weekly-updates.mjs --skip-migrate
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const skipWeb = process.argv.includes("--skip-web");
const skipMigrate = process.argv.includes("--skip-migrate");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `wc-weekly-updates-${stamp}`;

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "packages/contracts/src/industrial-module-pages.ts",
  "packages/contracts/src/industrial-dashboard-attention.ts",
  "packages/database/drizzle/0102_industrial_wc_weekly_updates_s1.sql",
  "packages/database/src/schema/industrial.ts",
  "apps/platform-api/src/modules/industrial/workers-comp-helpers.ts",
  "apps/industrial-web/src/components/workers-comp-workspace.tsx",
  "apps/industrial-web/src/lib/workers-comp-module.ts",
];
for (const rel of required) {
  if (!fs.existsSync(rel)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

console.log("=== Build packages ===");
sh("pnpm --filter @forge/contracts build");
sh("pnpm --filter @forge/database build");

console.log("=== Build/push platform-api ===");
sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);
sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
sh(`docker push ${API_ECR}:${tag}`);

const keep = [
  "family",
  "taskRoleArn",
  "executionRoleArn",
  "networkMode",
  "containerDefinitions",
  "requiresCompatibilities",
  "cpu",
  "memory",
  "volumes",
  "placementConstraints",
  "runtimePlatform",
  "proxyConfiguration",
  "ephemeralStorage",
];

function slim(td) {
  const out = {};
  for (const k of keep) if (td[k] !== undefined) out[k] = td[k];
  return out;
}

const apiTd = JSON.parse(
  shOut(`aws ecs describe-task-definition --task-definition ${API_SERVICE} --output json`),
).taskDefinition;
apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
const apiPath = `.forge-td-prod-api-wc-weekly-updates.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;

console.log("=== Roll production platform-api ===");
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

if (!skipMigrate) {
  console.log("=== Apply migrations (production) ===");
  sh(
    `node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`,
  );
}

if (!skipWeb) {
  console.log("=== Sync industrial-web ===");
  process.env.NODE_ENV = "production";
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION =
    process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "WHEN_REQUIRED";
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION =
    process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "WHEN_REQUIRED";
  process.env.FORGE_ENVIRONMENT = "production";
  sh("node scripts/sync-static-site.mjs --app industrial --environment production");
}

console.log(
  JSON.stringify({ ok: true, tag, apiTaskDefinition: apiReg.taskDefinitionArn }, null, 2),
);
