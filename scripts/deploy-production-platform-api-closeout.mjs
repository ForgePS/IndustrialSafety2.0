#!/usr/bin/env node
/**
 * Build, push, and roll production platform-api (+ optional worker) for onboarding closeout.
 * Does not touch Development. Requires Docker + AWS CLI auth to account 511343547817.
 *
 * Usage:
 *   node scripts/deploy-production-platform-api-closeout.mjs
 *   node scripts/deploy-production-platform-api-closeout.mjs --with-worker
 *   node scripts/deploy-production-platform-api-closeout.mjs --register-only
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const WORKER_SERVICE = "forge-production-ecs-worker-service";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const WORKER_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-workerservice`;

const withWorker = process.argv.includes("--with-worker");
const registerOnly = process.argv.includes("--register-only");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = `onboarding-closeout-${stamp}`;

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

if (withWorker) {
  sh(`docker build -f apps/worker-service/Dockerfile -t forge-worker-service:${tag} .`);
  sh(`docker tag forge-worker-service:${tag} ${WORKER_ECR}:${tag}`);
  sh(`docker push ${WORKER_ECR}:${tag}`);
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
const apiEnv = apiTd.containerDefinitions[0].environment ?? [];
const vanityOrigin = "https://producers-rice-mill.forgepublicsafety.com";
const corsOrigins = apiEnv.find((e) => e.name === "CORS_ORIGINS");
if (corsOrigins && !String(corsOrigins.value).includes(vanityOrigin)) {
  corsOrigins.value = `${corsOrigins.value},${vanityOrigin}`;
}
const corsSuffixes = apiEnv.find((e) => e.name === "CORS_ORIGIN_SUFFIXES");
if (corsSuffixes) {
  corsSuffixes.value = ".forgepublicsafety.com";
} else {
  apiEnv.push({ name: "CORS_ORIGIN_SUFFIXES", value: ".forgepublicsafety.com" });
}
apiTd.containerDefinitions[0].environment = apiEnv;
const apiPath = `.forge-td-prod-api-closeout.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);

if (!registerOnly) {
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
  );
}

let workerReg = null;
if (withWorker) {
  const workerTd = describe(WORKER_SERVICE);
  workerTd.containerDefinitions[0].image = `${WORKER_ECR}:${tag}`;
  const workerPath = `.forge-td-prod-worker-closeout.json`;
  fs.writeFileSync(workerPath, JSON.stringify(slim(workerTd), null, 2));
  workerReg = register(workerPath);
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${WORKER_SERVICE} --task-definition ${workerReg.taskDefinitionArn} --force-new-deployment --output json`,
  );
}

console.log(
  JSON.stringify(
    {
      tag,
      apiImage: `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      registerOnly,
      workerImage: withWorker ? `${WORKER_ECR}:${tag}` : null,
      workerTaskDefinition: workerReg?.taskDefinitionArn ?? null,
      next: [
        "aws ecs wait services-stable --cluster forge-production-ecs-platform --services forge-production-ecs-platform-api",
        "FORGE_ENV=production FORGE_ADMIN_DB_SECRET_NAME=forge-production-secrets-database node scripts/run-ecs-migrate.mjs",
      ],
    },
    null,
    2,
  ),
);
