#!/usr/bin/env node
/**
 * Production: recipient printed name + digital signature on Issue / PPE Issue.
 * - Migrates 0089
 * - Builds/pushes/rolls platform-api (keeps Resend + reporting env/secrets)
 * - Syncs industrial-web
 *
 * Usage: node scripts/deploy-production-supply-recipient-ack.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const FROM_ADDRESS = "noreply@forgepublicsafety.com";
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = `supply-recipient-ack-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function upsertEnv(environment, name, value) {
  const list = Array.isArray(environment) ? [...environment] : [];
  const idx = list.findIndex((e) => e.name === name);
  if (idx >= 0) list[idx] = { name, value };
  else list.push({ name, value });
  return list;
}

function upsertSecret(secrets, name, valueFrom) {
  const list = Array.isArray(secrets) ? [...secrets] : [];
  const idx = list.findIndex((s) => s.name === name);
  if (idx >= 0) list[idx] = { name, valueFrom };
  else list.push({ name, valueFrom });
  return list;
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
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

console.log("=== Build/push platform-api ===");
sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);
sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
sh(`docker push ${API_ECR}:${tag}`);

const queueUrl = shOut(
  `aws sqs get-queue-url --queue-name forge-production-sqs-reporting-schedules --region ${REGION} --query QueueUrl --output text`,
);
const resendArn = shOut(
  `aws secretsmanager describe-secret --secret-id forge-production-secrets-resend-api-key --region ${REGION} --query ARN --output text`,
);
const sweepArn = shOut(
  `aws secretsmanager describe-secret --secret-id forge-production-secrets-reporting-sweep-token --region ${REGION} --query ARN --output text`,
);

const apiTd = describe(API_SERVICE);
const container = apiTd.containerDefinitions[0];
container.image = `${API_ECR}:${tag}`;
container.environment = upsertEnv(container.environment, "FORGE_EMAIL_PROVIDER", "resend");
container.environment = upsertEnv(container.environment, "RESEND_FROM_ADDRESS", FROM_ADDRESS);
container.environment = upsertEnv(container.environment, "SES_FROM_ADDRESS", FROM_ADDRESS);
container.environment = upsertEnv(
  container.environment,
  "SQS_REPORTING_SCHEDULES_QUEUE_URL",
  queueUrl,
);
container.secrets = upsertSecret(container.secrets, "RESEND_API_KEY", resendArn);
container.secrets = upsertSecret(container.secrets, "FORGE_REPORTING_SWEEP_TOKEN", sweepArn);

const apiPath = ".forge-td-prod-api-supply-recipient-ack.json";
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);

sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE} --region ${REGION}`);

console.log("=== Migrate production (0089 recipient ack) ===");
sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`);

console.log("=== Sync industrial-web ===");
sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiRevision: apiReg.revision,
      feature: "supply-recipient-ack",
    },
    null,
    2,
  ),
);
