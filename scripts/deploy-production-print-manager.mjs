#!/usr/bin/env node
/**
 * Production deploy: Forge Print Manager (migrations 0097–0098 + phases 1–9).
 * 1) Build packages
 * 2) Build/push platform-api
 * 3) Roll ECS service
 * 4) Apply drizzle migrations
 * 5) Reseed platform catalog (feature definitions)
 * 6) Sync industrial-web + creator-console
 *
 * Usage: node scripts/deploy-production-print-manager.mjs
 *        node scripts/deploy-production-print-manager.mjs --skip-web
 *        node scripts/deploy-production-print-manager.mjs --skip-console
 *        node scripts/deploy-production-print-manager.mjs --skip-migrate
 *        node scripts/deploy-production-print-manager.mjs --skip-seed
 *        node scripts/deploy-production-print-manager.mjs --local-only
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const skipWeb = process.argv.includes("--skip-web");
const skipConsole = process.argv.includes("--skip-console");
const skipMigrate = process.argv.includes("--skip-migrate");
const skipSeed = process.argv.includes("--skip-seed");
const localOnly = process.argv.includes("--local-only");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `print-mgr-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "packages/database/drizzle/0097_industrial_print_routing_s1.sql",
  "packages/database/drizzle/0098_industrial_print_supplies_s1.sql",
  "packages/database/src/schema/industrial-print.ts",
  "apps/platform-api/src/modules/industrial/industrial-print.service.ts",
  "apps/platform-api/src/modules/industrial/industrial-print-creator.service.ts",
  "apps/industrial-web/src/components/print-manager-workspace.tsx",
  "apps/creator-console/src/components/tenant-print-health-panel.tsx",
  "docs/print-manager/PHASES_1_9_ACCEPTANCE.md",
];
for (const rel of required) {
  if (!fs.existsSync(rel)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
}

console.log("=== Local migrate + seed ===");
sh("pnpm db:migrate");
sh("pnpm db:seed");

if (localOnly) {
  console.log(JSON.stringify({ localOnly: true, migrated: true, seeded: true }, null, 2));
  process.exit(0);
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

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
const apiPath = `.forge-td-prod-api-print-manager.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;

console.log("=== Roll production platform-api ===");
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

if (!skipMigrate) {
  console.log("=== Apply migrations (production) ===");
  sh(
    `node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`,
  );
}

if (!skipSeed) {
  console.log("=== Reseed platform catalog (production) ===");
  sh(
    `node scripts/run-ecs-seed.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`,
  );
}

process.env.NODE_ENV = "production";
process.env.AWS_REQUEST_CHECKSUM_CALCULATION =
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "WHEN_REQUIRED";
process.env.AWS_RESPONSE_CHECKSUM_VALIDATION =
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "WHEN_REQUIRED";

if (!skipWeb) {
  console.log("=== Deploy production industrial-web ===");
  try {
    fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sh(`node scripts/sync-static-site.mjs --app industrial --environment production --full-invalidate`);
}

if (!skipConsole) {
  console.log("=== Deploy production creator-console ===");
  try {
    fs.rmSync("apps/creator-console/.next", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sh(`node scripts/sync-static-site.mjs --app console --environment production --full-invalidate`);
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiImage: `${API_ECR}:${tag}`,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      revision: apiReg.revision,
      migrated: !skipMigrate,
      seeded: !skipSeed,
      webSynced: !skipWeb,
      consoleSynced: !skipConsole,
      industrialUrl: "https://producersrice.forgepublicsafety.com/modules/print-manager",
    },
    null,
    2,
  ),
);
