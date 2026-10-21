#!/usr/bin/env node
/**
 * Deploy messaging attachment image fix:
 * - API streams /messaging/attachments/:id/content
 * - Industrial + Field load images via authenticated blob URLs
 *
 * Usage: node scripts/deploy-messaging-image-content.mjs
 *        node scripts/deploy-messaging-image-content.mjs --skip-web
 *        node scripts/deploy-messaging-image-content.mjs --dev-only
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const skipWeb = process.argv.includes("--skip-web");
const devOnly = process.argv.includes("--dev-only");
const prodOnly = process.argv.includes("--prod-only");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = `msg-img-content-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

const targets = [];
if (!prodOnly) {
  targets.push({
    name: "development",
    cluster: "forge-development-ecs-platform",
    service: "forge-development-ecs-platform-api",
    ecr: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`,
  });
}
if (!devOnly) {
  targets.push({
    name: "production",
    cluster: "forge-production-ecs-platform",
    service: "forge-production-ecs-platform-api",
    ecr: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`,
  });
}

sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);

sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);

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

for (const t of targets) {
  sh(`docker tag forge-platform-api:${tag} ${t.ecr}:${tag}`);
  sh(`docker push ${t.ecr}:${tag}`);

  const svc = JSON.parse(
    shOut(
      `aws ecs describe-services --cluster ${t.cluster} --services ${t.service} --output json`,
    ),
  );
  const currentTd = svc.services?.[0]?.taskDefinition;
  if (!currentTd) throw new Error(`No task definition for ${t.service}`);

  const td = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${currentTd} --output json`),
  ).taskDefinition;
  const next = slim(td);
  for (const c of next.containerDefinitions ?? []) {
    if (c.image && String(c.image).includes("platformapi")) {
      c.image = `${t.ecr}:${tag}`;
    }
  }
  const path = `.forge-msg-img-td-${t.name}-${stamp}.json`;
  fs.writeFileSync(path, JSON.stringify(next));
  try {
    const registered = JSON.parse(
      shOut(`aws ecs register-task-definition --cli-input-json file://${path} --output json`),
    ).taskDefinition;
    sh(
      `aws ecs update-service --cluster ${t.cluster} --service ${t.service} --task-definition ${registered.taskDefinitionArn} --force-new-deployment --output json`,
    );
    console.log(`Updated ${t.name} API → ${registered.taskDefinitionArn}`);
  } finally {
    try {
      fs.unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

if (!skipWeb) {
  if (!prodOnly) {
    sh("node scripts/sync-static-site.mjs --app industrial --environment development --full-invalidate");
    sh("node scripts/sync-static-site.mjs --app field --environment development --full-invalidate");
  }
  if (!devOnly) {
    sh(
      "cmd /c \"set FORGE_SAME_ORIGIN_API=1&& set FORGE_PRODUCTION_ACCOUNT=511343547817&& node scripts/sync-static-site.mjs --app industrial --environment production --full-invalidate\"",
      { shell: true },
    );
    sh(
      "cmd /c \"set FORGE_SAME_ORIGIN_API=1&& set FORGE_PRODUCTION_ACCOUNT=511343547817&& node scripts/sync-static-site.mjs --app field --environment production --full-invalidate\"",
      { shell: true },
    );
  }
}

console.log(`Messaging image content deploy complete (${tag}).`);
