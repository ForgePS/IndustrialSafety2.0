#!/usr/bin/env node
/**
 * Production deploy: wire Resend outbound email on platform-api.
 * - Builds/pushes API image (includes Resend SDK provider)
 * - Upserts FORGE_EMAIL_PROVIDER / RESEND_FROM_ADDRESS / SES_FROM_ADDRESS
 * - Mounts RESEND_API_KEY from Secrets Manager
 * - Rolls forge-production-ecs-platform-api
 *
 * Prerequisites:
 * - Secret forge-production-secrets-resend-api-key exists with the live key
 * - forge-production-iam-api-exec can GetSecretValue on that secret
 *
 * Usage:
 *   node scripts/deploy-production-resend-email.mjs
 *   node scripts/deploy-production-resend-email.mjs --register-only
 *   node scripts/deploy-production-resend-email.mjs --skip-build
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const RESEND_SECRET_NAME = "forge-production-secrets-resend-api-key";
const FROM_ADDRESS = "noreply@forgepublicsafety.com";

const registerOnly = process.argv.includes("--register-only");
const skipBuild = process.argv.includes("--skip-build");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = `resend-email-${stamp}`;

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

const secretArn = shOut(
  `aws secretsmanager describe-secret --region ${REGION} --secret-id ${RESEND_SECRET_NAME} --query ARN --output text`,
);
if (!secretArn.includes(RESEND_SECRET_NAME)) {
  throw new Error(`Unexpected Resend secret ARN: ${secretArn}`);
}

let imageUri;
if (skipBuild) {
  const current = JSON.parse(
    shOut(
      `aws ecs describe-services --cluster ${CLUSTER} --services ${API_SERVICE} --region ${REGION} --query services[0].taskDefinition --output json`,
    ),
  );
  const td = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${current} --output json`),
  ).taskDefinition;
  imageUri = td.containerDefinitions[0].image;
  console.log(`=== skip-build: reusing image ${imageUri} ===`);
} else {
  console.log("=== Build/push platform-api image ===");
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
  sh(`docker push ${API_ECR}:${tag}`);
  imageUri = `${API_ECR}:${tag}`;
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

console.log("=== Patch task definition (Resend env + secret) ===");
const apiTd = describe(API_SERVICE);
const container = apiTd.containerDefinitions[0];
container.image = imageUri;
container.environment = upsertEnv(container.environment, "FORGE_EMAIL_PROVIDER", "resend");
container.environment = upsertEnv(container.environment, "RESEND_FROM_ADDRESS", FROM_ADDRESS);
container.environment = upsertEnv(container.environment, "SES_FROM_ADDRESS", FROM_ADDRESS);
container.secrets = upsertSecret(container.secrets, "RESEND_API_KEY", secretArn);

const apiPath = `.forge-td-prod-api-resend-email.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);

console.log(
  JSON.stringify(
    {
      image: imageUri,
      taskDefinitionArn: apiReg.taskDefinitionArn,
      revision: apiReg.revision,
      resendSecretName: RESEND_SECRET_NAME,
      emailProvider: "resend",
      fromAddress: FROM_ADDRESS,
    },
    null,
    2,
  ),
);

if (!registerOnly) {
  console.log("=== Update service + wait stable ===");
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
  );
  sh(
    `aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE} --region ${REGION}`,
  );
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      service: API_SERVICE,
      revision: apiReg.revision,
      status: registerOnly ? "registered" : "deployed",
    },
    null,
    2,
  ),
);
