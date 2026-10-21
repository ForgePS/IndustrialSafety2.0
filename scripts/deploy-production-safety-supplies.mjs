#!/usr/bin/env node
/**
 * Production deploy: Safety Supplies Inventory (SSIM S0-S12).
 * API image + migrations 0072/0073 + industrial-web + field-web + tenant enable.
 *
 * Usage:
 *   node scripts/deploy-production-safety-supplies.mjs
 *   node scripts/deploy-production-safety-supplies.mjs --skip-migrate
 *   node scripts/deploy-production-safety-supplies.mjs --skip-web
 *   node scripts/deploy-production-safety-supplies.mjs --skip-enable
 *   node scripts/deploy-production-safety-supplies.mjs --register-only
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const registerOnly = process.argv.includes("--register-only");
const skipMigrate = process.argv.includes("--skip-migrate");
const skipWeb = process.argv.includes("--skip-web");
const skipEnable = process.argv.includes("--skip-enable");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = `safety-supplies-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

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

function describe(taskDef) {
  return JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${taskDef} --output json`),
  ).taskDefinition;
}

function register(path) {
  return JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${path} --output json`),
  ).taskDefinition;
}

const apiTd = describe(API_SERVICE);
apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
const apiPath = `.forge-td-prod-api-safety-supplies.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);

if (!registerOnly) {
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
  );
  sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);
}

if (!registerOnly && !skipMigrate) {
  sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`);
}

if (!registerOnly && !skipWeb) {
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync("apps/field-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
  // Field sync is optional: production FieldDomain/APP_URL is not always resolvable locally.
  if (process.env.SYNC_FIELD === "1") {
    sh(`node scripts/sync-static-site.mjs --app field --environment production`);
  }
}

if (!registerOnly && !skipEnable) {
  sh(`node scripts/run-ecs-enable-safety-supplies-module.mjs`, {
    env: { ...process.env, TENANT_KEY: "producers-rice-mill", APPLY: "1" },
  });
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiImage: `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      revision: apiReg.revision,
      deployed: !registerOnly,
      migrated: !registerOnly && !skipMigrate,
      webSynced: !registerOnly && !skipWeb,
      enabled: !registerOnly && !skipEnable,
    },
    null,
    2,
  ),
);
