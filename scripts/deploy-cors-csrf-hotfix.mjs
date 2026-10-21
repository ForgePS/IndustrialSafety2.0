#!/usr/bin/env node
/**
 * Quick production hotfix: allow X-Forge-Csrf in CORS preflight.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const SERVICE = "forge-production-ecs-platform-api";
const ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const TD_FILE = ".forge-td-prod-api-cors-csrf.json";
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `cors-csrf-fix-${stamp}`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd: root, ...opts });
}
function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

const mainTs = fs.readFileSync(path.join(root, "apps/platform-api/src/main.ts"), "utf8");
if (!mainTs.includes('"X-Forge-Csrf"')) {
  throw new Error("apps/platform-api/src/main.ts is missing X-Forge-Csrf allowlist entry");
}
console.log("Source check: X-Forge-Csrf present in main.ts");

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) throw new Error(`Wrong account ${identity.Account}`);

sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);

// Bust any stale layer identity
fs.appendFileSync(
  path.join(root, "apps/platform-api/src/main.ts"),
  `\n// cors-csrf-bust ${tag}\n`,
);

sh(`docker build --no-cache -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);

const check = shOut(
  `docker run --rm --entrypoint sh forge-platform-api:${tag} -c "grep -c X-Forge-Csrf dist/main.js || true"`,
);
console.log(`Image grep X-Forge-Csrf count: ${check}`);
if (String(check).trim() === "0" || !String(check).trim()) {
  throw new Error("Built image dist/main.js does not contain X-Forge-Csrf — refusing deploy");
}

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
function slim(td) {
  const out = {};
  for (const k of keep) if (td[k] !== undefined) out[k] = td[k];
  return out;
}

const apiTd = JSON.parse(
  shOut(`aws ecs describe-task-definition --task-definition ${SERVICE} --output json`),
).taskDefinition;
apiTd.containerDefinitions[0].image = `${ECR}:${tag}`;
apiTd.containerDefinitions[0].environment = (
  apiTd.containerDefinitions[0].environment ?? []
).filter((e) => e?.name !== "FORGE_ALLOW_DEV_PRINCIPAL");

fs.writeFileSync(path.join(root, TD_FILE), JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${TD_FILE} --output json`),
).taskDefinition;
console.log(`Registered ${apiReg.taskDefinitionArn}`);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);
sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${SERVICE} --region ${REGION}`);
console.log(JSON.stringify({ imageTag: tag, taskDefinition: apiReg.taskDefinitionArn }, null, 2));
