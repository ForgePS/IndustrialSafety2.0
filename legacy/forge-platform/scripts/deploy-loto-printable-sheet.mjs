#!/usr/bin/env node
/**
 * Deploy LOTO printable sheet (Producers background) + related UI:
 * - platform-api production (+ development)
 * - industrial-web production
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `loto-sheet-${stamp}`;

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";

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

if (!fs.existsSync("apps/platform-api/assets/branding/producers-loto-procedure-sheet.png")) {
  throw new Error("Missing LOTO sheet asset under apps/platform-api/assets/branding/");
}
if (!fs.existsSync("apps/industrial-web/public/branding/producers-loto-procedure-sheet.png")) {
  throw new Error("Missing LOTO sheet asset under apps/industrial-web/public/branding/");
}
if (!fs.existsSync("apps/platform-api/src/modules/industrial/loto-print.ts")) {
  throw new Error("Missing loto-print.ts");
}

const PROD_CLUSTER = "forge-production-ecs-platform";
const PROD_SERVICE = "forge-production-ecs-platform-api";
const PROD_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const DEV_CLUSTER = "forge-development-ecs-platform";
const DEV_SERVICE = "forge-development-ecs-platform-api";
const DEV_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`;

if (process.env.SKIP_BUILD !== "1") {
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${PROD_ECR}:${tag}`);
  sh(`docker tag forge-platform-api:${tag} ${DEV_ECR}:${tag}`);
  sh(`docker push ${PROD_ECR}:${tag}`);
  sh(`docker push ${DEV_ECR}:${tag}`);
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

function rollApi(service, cluster, ecr) {
  const apiTd = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${service} --output json`),
  ).taskDefinition;
  apiTd.containerDefinitions[0].image = `${ecr}:${tag}`;
  const apiPath = `.forge-td-${service}-loto-sheet.json`;
  fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
  const apiReg = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
  ).taskDefinition;
  sh(
    `aws ecs update-service --cluster ${cluster} --service ${service} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment`,
  );
  sh(`aws ecs wait services-stable --cluster ${cluster} --services ${service}`);
  return apiReg.taskDefinitionArn;
}

const prodTd = rollApi(PROD_SERVICE, PROD_CLUSTER, PROD_ECR);
const devTd = rollApi(DEV_SERVICE, DEV_CLUSTER, DEV_ECR);

process.env.NODE_ENV = "production";
try {
  fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
} catch {
  // ignore Windows lock races
}
sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);

console.log(
  JSON.stringify(
    {
      ok: true,
      tag,
      prodTaskDefinition: prodTd,
      devTaskDefinition: devTd,
    },
    null,
    2,
  ),
);
