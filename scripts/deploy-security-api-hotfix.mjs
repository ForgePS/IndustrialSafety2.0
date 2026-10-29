#!/usr/bin/env node
/**
 * Deploy platform-api security hotfix (FIS-SEC-AUDIT-001) to Production and Development.
 *
 * Covers: public QR permission trust removal, hosted-dev principal lockdown,
 * platform-admin home-tenant authority, X-Powered-By strip.
 *
 * Usage:
 *   node scripts/deploy-security-api-hotfix.mjs
 *   node scripts/deploy-security-api-hotfix.mjs --production-only
 *   node scripts/deploy-security-api-hotfix.mjs --development-only
 *   node scripts/deploy-security-api-hotfix.mjs --skip-wait
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";

const targets = {
  production: {
    cluster: "forge-production-ecs-platform",
    service: "forge-production-ecs-platform-api",
    ecr: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`,
    tdFile: ".forge-td-prod-api-sec-hotfix.json",
  },
  development: {
    cluster: "forge-development-ecs-platform",
    service: "forge-development-ecs-platform-api",
    ecr: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`,
    tdFile: ".forge-td-dev-api-sec-hotfix.json",
  },
};

const productionOnly = process.argv.includes("--production-only");
const developmentOnly = process.argv.includes("--development-only");
const skipWait = process.argv.includes("--skip-wait");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `sec-audit-hotfix-${stamp}`;

const envs = [];
if (!developmentOnly) envs.push("production");
if (!productionOnly) envs.push("development");

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

/** Ensure hosted APIs do not opt into x-forge-dev-principal. */
function scrubDevPrincipalFlag(environment) {
  const env = Array.isArray(environment) ? [...environment] : [];
  return env.filter((e) => e?.name !== "FORGE_ALLOW_DEV_PRINCIPAL");
}

const results = [];

for (const name of envs) {
  const t = targets[name];
  sh(`docker tag forge-platform-api:${tag} ${t.ecr}:${tag}`);
  sh(`docker push ${t.ecr}:${tag}`);

  const apiTd = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${t.service} --output json`),
  ).taskDefinition;
  apiTd.containerDefinitions[0].image = `${t.ecr}:${tag}`;
  apiTd.containerDefinitions[0].environment = scrubDevPrincipalFlag(
    apiTd.containerDefinitions[0].environment,
  );
  fs.writeFileSync(t.tdFile, JSON.stringify(slim(apiTd), null, 2));
  const apiReg = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${t.tdFile} --output json`),
  ).taskDefinition;

  sh(
    `aws ecs update-service --cluster ${t.cluster} --service ${t.service} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
  );

  if (!skipWait) {
    sh(`aws ecs wait services-stable --cluster ${t.cluster} --services ${t.service}`);
  }

  results.push({
    environment: name,
    tag,
    image: `${t.ecr}:${tag}`,
    taskDefinitionArn: apiReg.taskDefinitionArn,
    revision: apiReg.revision,
    waited: !skipWait,
  });
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
