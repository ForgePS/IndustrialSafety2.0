#!/usr/bin/env node
/**
 * Deploy LOTO Department form + related fixes:
 * - platform-api production + development
 * - industrial-web production
 * - field-web development host
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const tag = process.env.DEPLOY_TAG || `loto-dept-${stamp}`;

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

const PROD_CLUSTER = "forge-production-ecs-platform";
const PROD_SERVICE = "forge-production-ecs-platform-api";
const PROD_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const DEV_CLUSTER = "forge-development-ecs-platform";
const DEV_SERVICE = "forge-development-ecs-platform-api";
const DEV_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-development-ecr-platformapi`;

if (process.env.SKIP_BUILD !== "1") {
  sh(
    `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
    { shell: true },
  );
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${PROD_ECR}:${tag}`);
  sh(`docker tag forge-platform-api:${tag} ${DEV_ECR}:${tag}`);
  sh(`docker push ${PROD_ECR}:${tag}`);
  sh(`docker push ${DEV_ECR}:${tag}`);
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

function rollApi(service, cluster, ecr) {
  const apiTd = JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${service} --output json`),
  ).taskDefinition;
  apiTd.containerDefinitions[0].image = `${ecr}:${tag}`;
  const apiPath = `.forge-td-${service}-loto-dept.json`;
  fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
  const apiReg = JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${apiPath} --output json`),
  ).taskDefinition;
  sh(
    `aws ecs update-service --cluster ${cluster} --service ${service} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment`,
  );
  sh(`aws ecs wait services-stable --cluster ${cluster} --services ${service}`);
  return apiReg.taskDefinitionArn;
}

const prodTd = rollApi(PROD_SERVICE, PROD_CLUSTER, PROD_ECR);
const devTd = rollApi(DEV_SERVICE, DEV_CLUSTER, DEV_ECR);

process.env.NODE_ENV = "production";
try {
  fs.rmSync("apps/industrial-web/.next", { recursive: true, force: true });
} catch {
  // ignore Windows lock races; sync-static-site also isolates the build dir
}
sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);

const fieldBucket = "forge-development-field-511343547817-us-east-1";
const fieldDistributionId = "ENAQ982VUMGQ6";
const fieldOrigin = "https://dr716wyn2h1dm.cloudfront.net";
const buildRoot = "C:\\Temp\\forge-field-web-deploy";
const repo = process.cwd();

function robocopyOk(src, dest, extraArgs) {
  const cmd = `robocopy "${src}" "${dest}" ${extraArgs}`;
  console.log(`$ ${cmd}`);
  try {
    execSync(cmd, { encoding: "utf8", stdio: "inherit", shell: true });
  } catch (err) {
    const code = err && typeof err.status === "number" ? err.status : 1;
    if (code >= 8) throw err;
  }
}

sh(
  `powershell -NoProfile -Command "if (Test-Path '${buildRoot}') { Remove-Item -Recurse -Force '${buildRoot}' }; New-Item -ItemType Directory -Path '${buildRoot}' | Out-Null"`,
);
robocopyOk(
  path.join(repo, "apps", "field-web"),
  path.join(buildRoot, "apps", "field-web"),
  "/E /XD node_modules .next out .next_* /NFL /NDL /NJH /NJS /nc /ns /np",
);
robocopyOk(
  path.join(repo, "packages"),
  path.join(buildRoot, "packages"),
  "/E /XD node_modules dist .turbo /NFL /NDL /NJH /NJS /nc /ns /np",
);
for (const file of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "tsconfig.base.json"]) {
  const src = path.join(repo, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(buildRoot, file));
}
sh(`cmd /c mklink /J "${path.join(buildRoot, "node_modules")}" "${path.join(repo, "node_modules")}"`);
sh(
  `cmd /c mklink /J "${path.join(buildRoot, "apps", "field-web", "node_modules")}" "${path.join(repo, "apps", "field-web", "node_modules")}"`,
);

const envFile = `NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_API_URL=https://api-dev.forgepublicsafety.com
NEXT_PUBLIC_APP_URL=${fieldOrigin}
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_VYjUFLXG4
NEXT_PUBLIC_COGNITO_CLIENT_ID=2ejbv5ignav7m57jk141be094b
NEXT_PUBLIC_COGNITO_DOMAIN=forge-development-547817.auth.us-east-1.amazoncognito.com
`;
fs.writeFileSync(path.join(buildRoot, "apps", "field-web", ".env.production.local"), envFile);
const localEnv = path.join(buildRoot, "apps", "field-web", ".env.local");
if (fs.existsSync(localEnv)) fs.unlinkSync(localEnv);

sh("pnpm exec next build", { cwd: path.join(buildRoot, "apps", "field-web"), shell: true });
const outDir = path.join(buildRoot, "apps", "field-web", "out");
if (!fs.existsSync(path.join(outDir, "index.html"))) {
  throw new Error("Missing field-web out/index.html");
}
sh(`aws s3 sync "${outDir}" "s3://${fieldBucket}/" --delete`);
sh(`aws cloudfront create-invalidation --distribution-id ${fieldDistributionId} --paths "/*"`);

console.log(
  JSON.stringify(
    {
      ok: true,
      tag,
      prodApiTaskDefinition: prodTd,
      devApiTaskDefinition: devTd,
      fieldOrigin,
      fieldBucket,
    },
    null,
    2,
  ),
);
