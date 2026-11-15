import { execSync } from "node:child_process";
import fs from "node:fs";

const tag = fs.readFileSync(".forge-s4-tag.txt", "utf8").trim();
const apiImage = `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi:${tag}`;
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

const raw = execSync(
  "aws ecs describe-task-definition --task-definition forge-development-ecs-platform-api --output json",
  { encoding: "utf8" },
);
const td = JSON.parse(raw).taskDefinition;
const prior = td.revision;
td.containerDefinitions[0].image = apiImage;
fs.writeFileSync(".forge-td-s4-api.json", JSON.stringify(slim(td), null, 2));
const reg = JSON.parse(
  execSync(
    "aws ecs register-task-definition --cli-input-json file://.forge-td-s4-api.json --output json",
    { encoding: "utf8" },
  ),
).taskDefinition;

const result = {
  priorRevision: prior,
  arn: reg.taskDefinitionArn,
  revision: reg.revision,
  image: reg.containerDefinitions[0].image,
  tag,
};
fs.writeFileSync(
  "docs/testing/evidence/import-platform/s4-td-register.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
