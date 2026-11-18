import { execSync } from "node:child_process";
import fs from "node:fs";

const tag = fs.readFileSync(".forge-s5-tag.txt", "utf8").trim();
const apiImage = `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi:${tag}`;
const workerImage = `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-workerservice:${tag}`;

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

function describe(taskDef) {
  return JSON.parse(
    execSync(`aws ecs describe-task-definition --task-definition ${taskDef} --output json`, {
      encoding: "utf8",
    }),
  ).taskDefinition;
}

function register(path) {
  return JSON.parse(
    execSync(`aws ecs register-task-definition --cli-input-json file://${path} --output json`, {
      encoding: "utf8",
    }),
  ).taskDefinition;
}

const apiTd = describe("forge-development-ecs-platform-api");
const apiPrior = apiTd.revision;
apiTd.containerDefinitions[0].image = apiImage;
fs.writeFileSync(".forge-td-s5-api.json", JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(".forge-td-s5-api.json");

const workerTd = describe("forge-development-ecs-worker-service");
const workerPrior = workerTd.revision;
workerTd.containerDefinitions[0].image = workerImage;
fs.writeFileSync(".forge-td-s5-worker.json", JSON.stringify(slim(workerTd), null, 2));
const workerReg = register(".forge-td-s5-worker.json");

const result = {
  tag,
  api: {
    priorRevision: apiPrior,
    arn: apiReg.taskDefinitionArn,
    revision: apiReg.revision,
    image: apiReg.containerDefinitions[0].image,
  },
  worker: {
    priorRevision: workerPrior,
    arn: workerReg.taskDefinitionArn,
    revision: workerReg.revision,
    image: workerReg.containerDefinitions[0].image,
  },
};
fs.writeFileSync(
  "docs/testing/evidence/import-platform/s5-td-register.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
