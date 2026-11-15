#!/usr/bin/env node
/**
 * Production deploy: form checkbox print/fill/builder fixes.
 *
 * Usage: node scripts/deploy-production-form-checkbox-fix.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = `form-checkbox-fix-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function clearIndustrialBuildDirs() {
  const appRoot = path.join("apps", "industrial-web");
  if (!fs.existsSync(appRoot)) return;
  for (const name of fs.readdirSync(appRoot)) {
    if (
      name === ".next" ||
      name === "out" ||
      name.startsWith(".next_locked_") ||
      name.startsWith("out_locked_")
    ) {
      const full = path.join(appRoot, name);
      const dest = path.join(
        process.env.TEMP || process.env.TMP || ".",
        `iw-clear-${name}-${Date.now()}`,
      );
      try {
        fs.renameSync(full, dest);
        console.log(`Moved locked ${full} -> ${dest}`);
      } catch (err) {
        console.warn(`Could not move ${full}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

const required = [
  "apps/platform-api/src/modules/industrial/form-print.ts",
  "apps/industrial-web/src/components/forms-workspace.tsx",
  "apps/industrial-web/src/components/form-builder-modal.tsx",
];
for (const rel of required) {
  if (!fs.existsSync(rel)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
}

const printSrc = fs.readFileSync(required[0], "utf8");
const fillSrc = fs.readFileSync(required[1], "utf8");
const builderSrc = fs.readFileSync(required[2], "utf8");
if (!printSrc.includes('kind === "checkbox"') || !printSrc.includes("formatCheckboxPrintValue")) {
  console.error("Checkbox print fix missing — aborting deploy");
  process.exit(1);
}
if (!fillSrc.includes("Check to confirm.") || !builderSrc.includes("field-preview-")) {
  console.error("Checkbox fill/builder fix missing — aborting deploy");
  process.exit(1);
}

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
const apiPath = `.forge-td-prod-api-form-checkbox-fix.json`;
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
).taskDefinition;
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE}`);

clearIndustrialBuildDirs();
process.env.NODE_ENV = "production";
process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";
sh(`node scripts/sync-static-site.mjs --app industrial --environment production --full-invalidate`);

console.log(
  JSON.stringify(
    {
      ok: true,
      tag,
      apiTaskDefinition: apiReg.taskDefinitionArn,
      note: "Hard-refresh industrial; form checkboxes should show as boxes in fill, builder, and print.",
    },
    null,
    2,
  ),
);
