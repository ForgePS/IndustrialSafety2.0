#!/usr/bin/env node
/**
 * Deploy production platform-api + industrial-web for public LOTO procedure QR:
 * - PUBLIC_ACTION access mode for LOTO stickers
 * - Public procedure view + anonymous report-issue
 * - Scan hub LOTO panel
 *
 * Usage: node scripts/deploy-production-loto-public-qr.mjs
 *        node scripts/deploy-production-loto-public-qr.mjs --skip-web
 *        SKIP_BUILD=1 node scripts/deploy-production-loto-public-qr.mjs
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
const tag = process.env.DEPLOY_TAG || `loto-public-qr-${stamp}`;
const skipWeb = process.argv.includes("--skip-web");

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "apps/platform-api/src/modules/industrial/scan-actions.ts",
  "apps/platform-api/src/modules/industrial/industrial-public-qr.service.ts",
  "apps/platform-api/src/modules/industrial/industrial-public-qr.controller.ts",
  "apps/platform-api/src/modules/industrial/industrial-qr.service.ts",
  "apps/industrial-web/src/components/scan-public-workspace.tsx",
  "apps/industrial-web/src/components/loto-workspace.tsx",
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

if (process.env.SKIP_BUILD !== "1") {
  console.log("=== Build/push platform-api ===");
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
  sh(`docker push ${API_ECR}:${tag}`);
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

console.log("=== Register + roll production platform-api ===");
const apiTd = JSON.parse(
  shOut(`aws ecs describe-task-definition --task-definition ${API_SERVICE} --output json`),
).taskDefinition;
apiTd.containerDefinitions[0].image = `${API_ECR}:${tag}`;
const apiPath = `.forge-td-prod-api-loto-public-qr.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

if (!skipWeb) {
  console.log("=== Sync industrial-web production ===");
  process.env.NODE_ENV = "production";
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    // ignore Windows lock races
  }
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tag,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      industrialWeb: skipWeb ? "skipped" : "synced",
    },
    null,
    2,
  ),
);
