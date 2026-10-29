#!/usr/bin/env node
/**
 * Dump platform-api COGNITO_CLIENT_ID from current ECS task definition.
 */
import { spawnSync } from "node:child_process";

const r = spawnSync(
  "aws",
  [
    "ecs",
    "describe-task-definition",
    "--task-definition",
    "forge-development-ecs-platform-api:65",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true, maxBuffer: 20_000_000 },
);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
const td = JSON.parse(r.stdout).taskDefinition;
const env = td.containerDefinitions[0].environment || [];
const cognito = env.find((e) => e.name === "COGNITO_CLIENT_ID");
const industrial = "3rls9835j4qs3jmchb3uh7ketm";
const ids = (cognito?.value || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
console.log(
  JSON.stringify(
    {
      taskDefinition: td.taskDefinitionArn,
      cognitoClientIds: ids,
      includesIndustrial: ids.includes(industrial),
      industrialClientId: industrial,
    },
    null,
    2,
  ),
);
