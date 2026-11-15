#!/usr/bin/env node
/**
 * Production deploy: Grain Facility Sanitation module (migrations 0091+).
 * 1) Build packages
 * 2) Build/push platform-api
 * 3) Roll ECS service
 * 4) Apply drizzle migrations (includes 0100_industrial_sanitation_ui_settings_s1)
 * 5) Enable SANITATION for producers-rice-mill
 * 6) Sync industrial-web + field-web
 *
 * Usage: node scripts/deploy-production-sanitation.mjs
 *        node scripts/deploy-production-sanitation.mjs --skip-web
 *        node scripts/deploy-production-sanitation.mjs --skip-migrate
 *        node scripts/deploy-production-sanitation.mjs --skip-enable
 *        node scripts/deploy-production-sanitation.mjs --skip-field
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const skipWeb = process.argv.includes("--skip-web");
const skipField = process.argv.includes("--skip-field");
const skipMigrate = process.argv.includes("--skip-migrate");
const skipEnable = process.argv.includes("--skip-enable");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `sanitation-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "packages/database/drizzle/0091_industrial_sanitation_s1.sql",
  "packages/database/drizzle/0100_industrial_sanitation_ui_settings_s1.sql",
  "packages/database/src/schema/industrial-sanitation.ts",
  "apps/platform-api/src/modules/industrial/industrial-sanitation.controller.ts",
  "apps/platform-api/src/modules/industrial/industrial-sanitation.service.ts",
  "apps/platform-api/src/modules/industrial/sanitation-print.ts",
  "apps/industrial-web/src/components/sanitation-workspace.tsx",
  "apps/industrial-web/src/lib/sanitation-module.ts",
  "apps/field-web/src/app/sanitation/page.tsx",
  "scripts/enable-sanitation-module.mjs",
  "scripts/run-ecs-enable-sanitation-module.mjs",
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
const apiPath = `.forge-td-prod-api-sanitation.json`;
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

if (!skipEnable) {
  console.log("=== Enable SANITATION for producers-rice-mill ===");
  sh(`node scripts/run-ecs-enable-sanitation-module.mjs`, {
    env: { ...process.env, TENANT_KEY: "producers-rice-mill", APPLY: "1" },
  });
}

process.env.NODE_ENV = "production";
process.env.AWS_REQUEST_CHECKSUM_CALCULATION =
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "WHEN_REQUIRED";
process.env.AWS_RESPONSE_CHECKSUM_VALIDATION =
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "WHEN_REQUIRED";

if (!skipWeb) {
  console.log("=== Deploy production industrial-web ===");
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
}

if (!skipField) {
  console.log("=== Deploy production field-web ===");
  try {
    fs.rmSync("apps/field-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sh(`node scripts/sync-static-site.mjs --app field --environment production`);
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiImage: `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      revision: apiReg.revision,
      migrated: !skipMigrate,
      enabledFor: skipEnable ? null : "producers-rice-mill",
      webSynced: !skipWeb,
      fieldSynced: !skipField,
      industrialUrl: "https://producersrice.forgepublicsafety.com/modules/sanitation",
    },
    null,
    2,
  ),
);
