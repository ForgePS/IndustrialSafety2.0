#!/usr/bin/env node
/**
 * Deploy LOTO printable sheet (new Producers header chrome) + print layout:
 * - platform-api production
 * - industrial-web production (branding PNG + CloudFront invalidate)
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
const tag = process.env.DEPLOY_TAG || `loto-sheet-${stamp}`;

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
const apiPath = `.forge-td-prod-api-loto-sheet.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment`,
);

process.env.NODE_ENV = "production";
// Session cookies + mill firewalls require same-origin /api (not API CloudFront host).
process.env.FORGE_SAME_ORIGIN_API = "1";
process.env.FORGE_PRODUCTION_ACCOUNT = process.env.FORGE_PRODUCTION_ACCOUNT || ACCOUNT;
sh("node scripts/sync-static-site.mjs --app industrial --environment production --full-invalidate");
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);
console.log(
  JSON.stringify({ ok: true, tag, apiTaskDefinition: apiReg.taskDefinitionArn }, null, 2),
);
