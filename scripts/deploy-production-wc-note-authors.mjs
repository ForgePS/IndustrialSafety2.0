#!/usr/bin/env node
/**
 * Production deploy: Workers' Comp authored notes (migration 0080).
 * 1) Build/push platform-api
 * 2) Roll ECS service
 * 3) Apply drizzle migrations (includes 0080_industrial_wc_note_authors_s1)
 * 4) Sync industrial-web
 *
 * Usage: node scripts/deploy-production-wc-note-authors.mjs
 *        node scripts/deploy-production-wc-note-authors.mjs --skip-web
 *        node scripts/deploy-production-wc-note-authors.mjs --skip-migrate
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
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `wc-note-authors-${stamp}`;

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
const apiPath = `.forge-td-prod-api-wc-note-authors.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);

console.log("=== Roll production platform-api ===");
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

if (!skipMigrate) {
  console.log("=== Apply migrations (production) ===");
  sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`);
}

if (!skipWeb) {
  console.log("=== Deploy production industrial-web ===");
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.env.NODE_ENV = "production";
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
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
      webSynced: !skipWeb,
    },
    null,
    2,
  ),
);
