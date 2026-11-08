#!/usr/bin/env node
/**
 * Deploy the OSHA reports audit (PR #37) and everything merged to master since the
 * 2026-10-28 production sync:
 * - platform-api image build/push and a new task definition
 * - migration 0113 (training content delivery) run with the NEW image, before the roll
 * - ECS roll to the new task definition
 * - industrial-web production sync + CloudFront invalidation
 *
 * Set SKIP_BUILD=1 with DEPLOY_TAG=<tag> to reuse an image already pushed.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `osha-reports-audit-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

const step = process.env.DEPLOY_STEP || "all"; // all | build | migrate | roll | web

if (process.env.SKIP_BUILD !== "1" && (step === "all" || step === "build")) {
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
  sh(`docker push ${API_ECR}:${tag}`);
  if (step === "build") {
    console.log(JSON.stringify({ ok: true, tag }, null, 2));
    process.exit(0);
  }
}

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

let taskDefinitionArn = process.env.TASK_DEFINITION_ARN;
if (!taskDefinitionArn && step !== "web") {
  const apiTd = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${API_SERVICE} --output json`),
  ).taskDefinition;
  apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
  const apiPath = `.forge-td-prod-api-osha-reports-audit.json`;
  fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
  taskDefinitionArn = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
  ).taskDefinition.taskDefinitionArn;
  fs.unlinkSync(apiPath);
  console.log(`registered ${taskDefinitionArn}`);
}

if (step === "all" || step === "migrate") {
  // Migrations ship inside the image, so run them from the new task definition.
  sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${taskDefinitionArn}`);
}

if (step === "all" || step === "roll") {
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${taskDefinitionArn} --force-new-deployment`,
  );
  sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);
}

if (step === "all" || step === "web") {
  process.env.NODE_ENV = "production";
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
}

console.log(JSON.stringify({ ok: true, tag, apiTaskDefinition: taskDefinitionArn }, null, 2));
