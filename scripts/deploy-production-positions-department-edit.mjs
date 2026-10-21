#!/usr/bin/env node
/**
 * Production deploy: Positions / job titles — edit department on inline save.
 * API image + industrial-web static sync (no DB migration).
 *
 * Usage: node scripts/deploy-production-positions-department-edit.mjs
 *        node scripts/deploy-production-positions-department-edit.mjs --skip-web
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const skipWeb = process.argv.includes("--skip-web");
const skipApi = process.argv.includes("--skip-api");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `positions-dept-edit-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "apps/platform-api/src/modules/industrial/industrial.controller.ts",
  "apps/platform-api/src/modules/industrial/industrial.service.ts",
  "apps/industrial-web/src/components/dropdowns-workspace.tsx",
  "apps/industrial-web/src/lib/industrial-dropdown-catalogs.ts",
];
for (const rel of required) {
  if (!fs.existsSync(rel)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

let apiReg = null;

if (!skipApi) {
  console.log("=== Build packages ===");
  sh("pnpm --filter @forge/contracts build");
  sh("pnpm --filter @forge/database build");

  console.log("=== Build/push platform-api ===");
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
  const apiPath = `.forge-td-prod-api-positions-dept-edit.json`;
  fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
  apiReg = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
  ).taskDefinition;

  console.log("=== Roll production platform-api ===");
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
  );
  sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);
}

if (!skipWeb) {
  console.log("=== Deploy production industrial-web ===");
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.env.NODE_ENV = "production";
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION =
    process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "WHEN_REQUIRED";
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION =
    process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "WHEN_REQUIRED";
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiImage: skipApi ? null : `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg?.taskDefinitionArn ?? null,
      revision: apiReg?.revision ?? null,
      webSynced: !skipWeb,
    },
    null,
    2,
  ),
);
