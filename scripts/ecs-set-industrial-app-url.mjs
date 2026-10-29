/**
 * Set FORGE_INDUSTRIAL_APP_URL on production API + worker to the new Producers host.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const CLUSTER = "forge-production-ecs-platform";
const SERVICES = [
  "forge-production-ecs-platform-api",
  "forge-production-ecs-worker-service",
];
const APP_URL = "https://producersrice.forgeindustrialsafety.com";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return JSON.parse(r.stdout);
}

function registerUpdatedTaskDef(taskDefArn) {
  const td = awsJson([
    "ecs",
    "describe-task-definition",
    "--task-definition",
    taskDefArn,
    "--output",
    "json",
  ]).taskDefinition;

  const containers = td.containerDefinitions.map((c) => {
    const env = [...(c.environment ?? [])];
    const idx = env.findIndex((e) => e.name === "FORGE_INDUSTRIAL_APP_URL");
    if (idx >= 0) env[idx] = { name: "FORGE_INDUSTRIAL_APP_URL", value: APP_URL };
    else env.push({ name: "FORGE_INDUSTRIAL_APP_URL", value: APP_URL });
    return { ...c, environment: env };
  });

  const input = {
    family: td.family,
    taskRoleArn: td.taskRoleArn,
    executionRoleArn: td.executionRoleArn,
    networkMode: td.networkMode,
    containerDefinitions: containers,
    requiresCompatibilities: td.requiresCompatibilities,
    cpu: td.cpu,
    memory: td.memory,
    volumes: td.volumes,
    placementConstraints: td.placementConstraints,
    runtimePlatform: td.runtimePlatform,
  };
  if (td.ephemeralStorage) input.ephemeralStorage = td.ephemeralStorage;

  const tmp = `.tmp-ecs-td-appurl-${td.family}.json`;
  fs.writeFileSync(tmp, JSON.stringify(input));
  return awsJson([
    "ecs",
    "register-task-definition",
    "--cli-input-json",
    `file://${tmp.replace(/\\/g, "/")}`,
    "--output",
    "json",
  ]).taskDefinition.taskDefinitionArn;
}

const results = [];
for (const service of SERVICES) {
  const svc = awsJson([
    "ecs",
    "describe-services",
    "--cluster",
    CLUSTER,
    "--services",
    service,
    "--output",
    "json",
  ]).services[0];
  const newArn = registerUpdatedTaskDef(svc.taskDefinition);
  awsJson([
    "ecs",
    "update-service",
    "--cluster",
    CLUSTER,
    "--service",
    service,
    "--task-definition",
    newArn,
    "--force-new-deployment",
    "--output",
    "json",
  ]);
  results.push({ service, taskDefinition: newArn, FORGE_INDUSTRIAL_APP_URL: APP_URL });
}
console.log(JSON.stringify({ updated: results }, null, 2));
