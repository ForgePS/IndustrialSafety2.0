#!/usr/bin/env node
/**
 * Deploy API (+ industrial web) for course material retarget / resolution fix.
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
const tag = `training-material-retarget-${stamp}`;

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
const apiPath = `.forge-td-prod-api-training-material-retarget.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION}`,
);
console.log(JSON.stringify({ ok: true, tag, taskDefinition: apiReg.taskDefinitionArn }, null, 2));
