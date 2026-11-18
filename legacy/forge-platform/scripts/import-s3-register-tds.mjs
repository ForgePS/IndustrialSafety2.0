import { execSync } from "node:child_process";
import fs from "node:fs";

const tag = process.env.IMPORT_S3_TAG || "import-s3-20260729092615";
const apiImage = `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi:${tag}`;
const workerImage = `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-workerservice:${tag}`;
const importBucket = "forge-development-imports-511343547817-us-east-1";

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
  for (const k of keep) {
    if (td[k] !== undefined) out[k] = td[k];
  }
  return out;
}

function describe(taskDef) {
  const raw = execSync(
    `aws ecs describe-task-definition --task-definition ${taskDef} --output json`,
    { encoding: "utf8" },
  );
  return JSON.parse(raw).taskDefinition;
}

function register(path) {
  const raw = execSync(
    `aws ecs register-task-definition --cli-input-json file://${path} --output json`,
    { encoding: "utf8" },
  );
  return JSON.parse(raw).taskDefinition;
}

const apiTd = describe("forge-development-ecs-platform-api:33");
apiTd.containerDefinitions[0].image = apiImage;
fs.writeFileSync(".forge-td-s3-api.json", JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(".forge-td-s3-api.json");

const workerTd = describe("forge-development-ecs-worker-service:19");
workerTd.containerDefinitions[0].image = workerImage;
const env = workerTd.containerDefinitions[0].environment || [];
const idx = env.findIndex((e) => e.name === "S3_IMPORT_BUCKET");
if (idx >= 0) env[idx].value = importBucket;
else env.push({ name: "S3_IMPORT_BUCKET", value: importBucket });
workerTd.containerDefinitions[0].environment = env;
fs.writeFileSync(".forge-td-s3-worker.json", JSON.stringify(slim(workerTd), null, 2));
const workerReg = register(".forge-td-s3-worker.json");

const result = {
  api: {
    arn: apiReg.taskDefinitionArn,
    revision: apiReg.revision,
    image: apiReg.containerDefinitions[0].image,
  },
  worker: {
    arn: workerReg.taskDefinitionArn,
    revision: workerReg.revision,
    image: workerReg.containerDefinitions[0].image,
    s3ImportBucket: (workerReg.containerDefinitions[0].environment || []).find(
      (e) => e.name === "S3_IMPORT_BUCKET",
    )?.value,
  },
};
fs.writeFileSync(
  "docs/testing/evidence/import-platform/s3-td-register.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
