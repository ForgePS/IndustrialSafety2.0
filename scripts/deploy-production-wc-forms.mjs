#!/usr/bin/env node
/**
 * Production deploy: Producers Workers' Comp forms (injury guidelines + HIPAA) + migration 0112.
 * Also releases everything built since the previous production release (2026-10-14).
 *
 * Runs one phase at a time so each production step can be confirmed:
 *   node scripts/deploy-production-wc-forms.mjs --phase image     build/push API image, register task definition
 *   node scripts/deploy-production-wc-forms.mjs --phase migrate --task-definition <arn>
 *   node scripts/deploy-production-wc-forms.mjs --phase roll    --task-definition <arn>
 *   node scripts/deploy-production-wc-forms.mjs --phase web
 *
 * Migrate runs before roll so the new API never starts without its table.
 * Rollback for the API: update-service back to the previous task definition.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const phase = arg("--phase");
const taskDefinition = arg("--task-definition");

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";
// Set PNPM="npx -y pnpm@10.12.1" when the global pnpm is not v10.
const PNPM = process.env.PNPM ?? "pnpm";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const required = [
  "packages/database/drizzle/0112_industrial_workers_comp_forms_s1.sql",
  "apps/platform-api/src/modules/industrial/workers-comp-forms.service.ts",
  "apps/platform-api/assets/forms/producers/employee-injury-guidelines.pdf",
  "apps/platform-api/assets/forms/producers/hipaa-authorization.pdf",
  "apps/industrial-web/src/components/workers-comp-forms-panel.tsx",
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

if (phase === "image") {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const tag = process.env.DEPLOY_TAG || `wc-forms-${stamp}`;

  sh(`${PNPM} --filter @forge/contracts build`);
  sh(`${PNPM} --filter @forge/database build`);
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
  const current = shOut(
    `aws ecs describe-services --cluster ${CLUSTER} --services ${API_SERVICE} --query "services[0].taskDefinition" --output text`,
  );
  const td = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${current} --output json`),
  ).taskDefinition;
  td.containerDefinitions[0].image = `${API_ECR}:${tag}`;
  const slim = {};
  for (const k of keep) if (td[k] !== undefined) slim[k] = td[k];
  const tdPath = ".forge-td-prod-api-wc-forms.json";
  fs.writeFileSync(tdPath, JSON.stringify(slim, null, 2));
  const registered = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${tdPath} --output json`),
  ).taskDefinition;
  fs.rmSync(tdPath);
  console.log(
    JSON.stringify(
      {
        ok: true,
        tag,
        previousTaskDefinition: current,
        taskDefinition: registered.taskDefinitionArn,
      },
      null,
      2,
    ),
  );
} else if (phase === "migrate") {
  if (!taskDefinition) throw new Error("--task-definition is required for migrate");
  sh(`node scripts/run-ecs-migrate.mjs --env production --task-definition ${taskDefinition}`);
} else if (phase === "roll") {
  if (!taskDefinition) throw new Error("--task-definition is required for roll");
  sh(
    `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${taskDefinition} --output json --query "service.deployments[0].{status:status,td:taskDefinition}"`,
  );
  sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);
} else if (phase === "web") {
  process.env.NODE_ENV = "production";
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION =
    process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "WHEN_REQUIRED";
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION =
    process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "WHEN_REQUIRED";
  process.env.FORGE_ENVIRONMENT = "production";
  sh("node scripts/sync-static-site.mjs --app industrial --environment production");
} else {
  console.error("Usage: --phase <image|migrate|roll|web> [--task-definition <arn>]");
  process.exit(1);
}
