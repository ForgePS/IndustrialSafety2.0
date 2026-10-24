#!/usr/bin/env node
/**
 * Deploy latency fixes to production:
 * - API: larger DB pool, batched messaging listThreads, unread-summary endpoint
 * - Industrial web: light unread poll (30s), deduped branding fetch
 *
 * Usage: node scripts/deploy-prod-latency-fixes.mjs
 *        node scripts/deploy-prod-latency-fixes.mjs --skip-web
 *        node scripts/deploy-prod-latency-fixes.mjs --skip-api
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const SERVICE = "forge-production-ecs-platform-api";
const ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const skipWeb = process.argv.includes("--skip-web");
const skipApi = process.argv.includes("--skip-api");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = `latency-${stamp}`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd: root, ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

if (!skipApi) {
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${ECR}:${tag}`);
  sh(`docker push ${ECR}:${tag}`);

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
  const svc = JSON.parse(
    shOut(`aws ecs describe-services --cluster ${CLUSTER} --services ${SERVICE} --output json`),
  );
  const currentTd = svc.services?.[0]?.taskDefinition;
  if (!currentTd) throw new Error("No task definition for API service");
  const td = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${currentTd} --output json`),
  ).taskDefinition;
  const next = {};
  for (const k of keep) if (td[k] !== undefined) next[k] = td[k];
  // Keep the hot-scaled size if already applied.
  if (!next.cpu || Number(next.cpu) < 1024) next.cpu = "1024";
  if (!next.memory || Number(next.memory) < 2048) next.memory = "2048";
  for (const c of next.containerDefinitions ?? []) {
    if (c.image && String(c.image).includes("platformapi")) {
      c.image = `${ECR}:${tag}`;
    }
  }
  const tdPath = path.join(root, `.forge-latency-td-${stamp}.json`);
  fs.writeFileSync(tdPath, JSON.stringify(next));
  try {
    const registered = JSON.parse(
      shOut(
        `aws ecs register-task-definition --cli-input-json file://${tdPath.replace(/\\/g, "/")} --output json`,
      ),
    ).taskDefinition;
    sh(
      `aws ecs update-service --cluster ${CLUSTER} --service ${SERVICE} --task-definition ${registered.taskDefinitionArn} --force-new-deployment --output json`,
    );
    console.log(`API → ${registered.taskDefinitionArn}`);
  } finally {
    try {
      fs.unlinkSync(tdPath);
    } catch {
      // ignore
    }
  }
}

if (!skipWeb) {
  const webEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: "",
    FORGE_SAME_ORIGIN_API: "1",
  };
  sh("pnpm --filter @forge/industrial-web build", {
    env: webEnv,
  });
  const sync = spawnSync(
    process.execPath,
    ["scripts/sync-static-site.mjs", "--app", "industrial", "--environment", "production"],
    { cwd: root, encoding: "utf8", stdio: "inherit", env: webEnv },
  );
  if (sync.status !== 0) throw new Error("industrial-web sync failed");
}

console.log(`Latency deploy complete (${tag}). Hard-refresh Industrial after ECS settles.`);
