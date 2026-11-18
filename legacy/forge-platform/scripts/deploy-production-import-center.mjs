#!/usr/bin/env node
/**
 * Deploy Import Center product adapters to production:
 * - platform-api (adapter selection + templates via @forge/imports)
 * - worker-service (personnel/fleet/org/training execute adapters)
 *
 * Requires Docker + AWS CLI auth to account 511343547817.
 * Industrial web is deployed separately via _run-import-center-web-deploy.ps1.
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

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = process.env.DEPLOY_TAG || `import-center-${stamp}`;

const required = [
  "packages/imports/src/execution/adapter.ts",
  "packages/imports/src/templates.ts",
  "apps/platform-api/src/modules/imports/import-execution.service.ts",
  "apps/worker-service/src/adapters/industrial-personnel-adapter.ts",
  "apps/worker-service/src/adapters/industrial-fleet-adapter.ts",
  "apps/worker-service/src/adapters/industrial-department-adapter.ts",
  "apps/worker-service/src/adapters/industrial-site-adapter.ts",
  "apps/worker-service/src/adapters/industrial-position-adapter.ts",
  "apps/worker-service/src/adapters/industrial-employment-type-adapter.ts",
  "apps/worker-service/src/adapters/industrial-training-adapter.ts",
  "apps/worker-service/src/processors/import-execute-processor.ts",
];

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

for (const rel of required) {
  if (!fs.existsSync(rel)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
}

const adapterSource = fs.readFileSync("packages/imports/src/execution/adapter.ts", "utf8");
for (const key of [
  "FORGE_INDUSTRIAL:ORG:site@1",
  "FORGE_INDUSTRIAL:ORG:position@1",
  "FORGE_INDUSTRIAL:ORG:employment_type@1",
  "FORGE_INDUSTRIAL:TRAINING:training_record@1",
]) {
  if (!adapterSource.includes(key)) {
    console.error(`SOURCE_STALE missing authorized adapter key: ${key}`);
    process.exit(3);
  }
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);

console.log("=== Build + push platform-api ===");
sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
sh(`docker push ${API_ECR}:${tag}`);

console.log("=== Build + push worker-service ===");
sh(`docker build -f apps/worker-service/Dockerfile -t forge-worker-service:${tag} .`);
sh(`docker tag forge-worker-service:${tag} ${WORKER_ECR}:${tag}`);
sh(`docker push ${WORKER_ECR}:${tag}`);

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

function setEnv(container, name, value) {
  const env = container.environment ?? [];
  const idx = env.findIndex((e) => e.name === name);
  if (idx >= 0) env[idx].value = value;
  else env.push({ name, value });
  container.environment = env;
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

console.log("=== Register + roll API ===");
const apiTd = describe(API_SERVICE);
apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
setEnv(
  apiTd.containerDefinitions[0],
  "IMPORT_MALWARE_PROVIDER_KEY",
  "aws-guardduty-malware-protection",
);
const apiPath = ".forge-td-prod-api-import-center.json";
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);

console.log("=== Register + roll worker ===");
const workerTd = describe(WORKER_SERVICE);
workerTd.containerDefinitions[0].image = `${WORKER_ECR}:${tag}`;
setEnv(
  workerTd.containerDefinitions[0],
  "IMPORT_MALWARE_PROVIDER_KEY",
  "aws-guardduty-malware-protection",
);
const workerPath = ".forge-td-prod-worker-import-center.json";
fs.writeFileSync(workerPath, JSON.stringify(slim(workerTd), null, 2));
const workerReg = register(workerPath);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${WORKER_SERVICE} --task-definition ${workerReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);

console.log("=== Wait for services stable ===");
sh(
  `aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE} ${WORKER_SERVICE} --region ${REGION}`,
);

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiImage: `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      apiRevision: apiReg.revision,
      workerImage: `${WORKER_ECR}:${tag}`,
      workerTaskDefinition: workerReg.taskDefinitionArn,
      workerRevision: workerReg.revision,
      web: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/_run-import-center-web-deploy.ps1",
    },
    null,
    2,
  ),
);
