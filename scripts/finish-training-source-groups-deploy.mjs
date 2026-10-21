#!/usr/bin/env node
/**
 * Finish training-source-groups deploy using an already-pushed ECR image.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const tag = process.argv[2] || "training-source-groups-20260903120632";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
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

const apiTd = JSON.parse(
  shOut(`aws ecs describe-task-definition --task-definition ${API_SERVICE} --output json`),
).taskDefinition;
apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
const apiPath = `.forge-td-prod-api-training-source-groups.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;
const arn = apiReg.taskDefinitionArn;
console.log(`TASK_DEF=${arn}`);

sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${arn}`);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${arn} --force-new-deployment`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

try {
  fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
} catch {
  // ignore
}
process.env.NODE_ENV = "production";
sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
console.log(JSON.stringify({ ok: true, tag, apiTaskDefinition: arn }, null, 2));
