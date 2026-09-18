#!/usr/bin/env node
/**
 * Development-only deploy for FIS-SEC session BFF + migrate.
 *
 * - Creates/ensures FORGE_AUTH_SESSION_ENCRYPTION_KEY secret (no value printed)
 * - Builds/pushes API image
 * - Registers task definition with secret injected
 * - Runs Aurora migrate (0105+)
 * - Updates ECS service and waits for stability
 *
 * Usage:
 *   node scripts/deploy-fis-session-dev.mjs
 *   node scripts/deploy-fis-session-dev.mjs --skip-wait
 *   node scripts/deploy-fis-session-dev.mjs --skip-migrate
 *
 * NEVER targets production.
 */
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const ENV = "development";
const SECRET_NAME = `forge-${ENV}-secrets-auth-session-encryption-key`;
const CLUSTER = "forge-development-ecs-platform";
const SERVICE = "forge-development-ecs-platform-api";
const ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`;
const TD_FILE = ".forge-td-dev-api-fis-session.json";

const skipWait = process.argv.includes("--skip-wait");
const skipMigrate = process.argv.includes("--skip-migrate");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `fis-session-${stamp}`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd: root, ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

function ensureSecret() {
  try {
    const arn = shOut(
      `aws secretsmanager describe-secret --secret-id ${SECRET_NAME} --region ${REGION} --query ARN --output text`,
    );
    console.log(`Using existing secret ${SECRET_NAME}`);
    return arn;
  } catch {
    // Create without printing plaintext: write to a temp file, then delete.
    const tmp = path.join(root, `.forge-auth-session-key-${stamp}.tmp`);
    try {
      const keyB64 = randomBytes(32).toString("base64");
      writeFileSync(tmp, keyB64, { encoding: "utf8", mode: 0o600 });
      const arn = shOut(
        `aws secretsmanager create-secret --name ${SECRET_NAME} --description "AES-256-GCM key for auth_browser_sessions refresh encryption (development)" --secret-string file://${tmp.replace(/\\/g, "/")} --region ${REGION} --query ARN --output text`,
      );
      console.log(`Created secret ${SECRET_NAME}`);
      return arn;
    } finally {
      if (existsSync(tmp)) unlinkSync(tmp);
    }
  }
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

console.log("=== FIS session deploy: DEVELOPMENT ONLY ===");
const secretArn = ensureSecret();

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

const secrets = Array.isArray(apiTd.containerDefinitions[0].secrets)
  ? [...apiTd.containerDefinitions[0].secrets]
  : [];
const withoutSession = secrets.filter((s) => s?.name !== "FORGE_AUTH_SESSION_ENCRYPTION_KEY");
withoutSession.push({
  name: "FORGE_AUTH_SESSION_ENCRYPTION_KEY",
  valueFrom: secretArn,
});
apiTd.containerDefinitions[0].secrets = withoutSession;

writeFileSync(path.join(root, TD_FILE), JSON.stringify(slim(apiTd), null, 2));
const apiReg = JSON.parse(
  shOut(`aws ecs register-task-definition --cli-input-json file://${TD_FILE} --output json`),
).taskDefinition;

console.log(`Registered ${apiReg.taskDefinitionArn}`);

if (!skipMigrate) {
  console.log("Running Aurora migrate (development)...");
  const migrate = spawnSync(
    "node",
    ["scripts/run-ecs-migrate.mjs", "--env", "development", "--task-definition", apiReg.taskDefinitionArn],
    { cwd: root, encoding: "utf8", stdio: "inherit", shell: true },
  );
  if (migrate.status !== 0) {
    throw new Error(`Migrate failed with exit ${migrate.status}`);
  }
}

sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);

if (!skipWait) {
  sh(`aws ecs wait services-stable --cluster ${CLUSTER} --services ${SERVICE} --region ${REGION}`);
}

console.log(
  JSON.stringify(
    {
      environment: ENV,
      imageTag: tag,
      taskDefinition: apiReg.taskDefinitionArn,
      secretName: SECRET_NAME,
      migrated: !skipMigrate,
    },
    null,
    2,
  ),
);
