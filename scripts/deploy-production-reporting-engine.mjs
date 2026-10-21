#!/usr/bin/env node
/**
 * Build, push, and roll production platform-api for Industrial Reporting Engine.
 * Does not touch Development. Requires Docker + AWS CLI auth to account 511343547817.
 *
 * Usage:
 *   node scripts/deploy-production-reporting-engine.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = `reporting-engine-${stamp}`;

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

sh("pnpm --filter @forge/contracts build");
sh("pnpm --filter @forge/database build");
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

const currentArn = shOut(
  `aws ecs describe-services --cluster ${CLUSTER} --services ${API_SERVICE} --query services[0].taskDefinition --output text`,
);
const td = slim(describe(currentArn));
for (const c of td.containerDefinitions ?? []) {
  if (c.name === "platform-api" || c.image?.includes("platformapi")) {
    c.image = `${API_ECR}:${tag}`;
  }
}
const tmp = `scripts/_td-reporting-${stamp}.json`;
fs.writeFileSync(tmp, JSON.stringify(td, null, 2));
const registered = register(tmp);
fs.unlinkSync(tmp);

sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${registered.taskDefinitionArn} --force-new-deployment --output text --query service.serviceName`,
);
console.log(`Deployed ${tag} as ${registered.taskDefinitionArn}`);
