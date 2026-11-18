#!/usr/bin/env node
/**
 * Deploy Emergency Alerts to Development:
 * 1) Build/push/roll platform-api
 * 2) Build/sync industrial-web (api-dev)
 *
 * Usage: node scripts/deploy-development-emergency-alerts.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-development-ecs-platform";
const API_SERVICE = "forge-development-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`;

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = `emergency-alerts-${stamp}`;

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

console.log("=== Build packages (contracts + database) ===");
sh("pnpm --filter @forge/contracts build");
sh("pnpm --filter @forge/database build");

console.log("=== Deploy development platform-api ===");
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
const apiPath = `.forge-td-dev-api-emergency-alerts.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
);

console.log("=== Deploy development industrial-web ===");
sh("node scripts/sync-static-site.mjs --app industrial --environment development");

console.log(
  JSON.stringify(
    {
      environment: "development",
      apiTag: tag,
      taskDefinitionArn: apiReg.taskDefinitionArn,
      revision: apiReg.revision,
      industrialUrl: "https://industrial-dev.forgepublicsafety.com",
      apiUrl: "https://api-dev.forgepublicsafety.com",
      modulePath: "/modules/emergency-alerts",
    },
    null,
    2,
  ),
);
