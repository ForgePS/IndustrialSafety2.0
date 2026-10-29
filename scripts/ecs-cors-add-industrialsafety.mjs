/**
 * Additive: append .forgeindustrialsafety.com to CORS_ORIGIN_SUFFIXES on
 * production API (and worker if present). Does not remove existing suffixes.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const CLUSTER = "forge-production-ecs-platform";
const SERVICES = [
  "forge-production-ecs-platform-api",
  "forge-production-ecs-worker-service",
];
const NEW_SUFFIX = ".forgeindustrialsafety.com";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "aws failed");
  }
  return JSON.parse(r.stdout);
}

function registerUpdatedTaskDef(taskDefArn) {
  const wrapped = awsJson([
    "ecs",
    "describe-task-definition",
    "--task-definition",
    taskDefArn,
    "--output",
    "json",
  ]);
  const td = wrapped.taskDefinition;
  const containers = td.containerDefinitions.map((c) => {
    const env = [...(c.environment ?? [])];
    const idx = env.findIndex((e) => e.name === "CORS_ORIGIN_SUFFIXES");
    if (idx >= 0) {
      const current = String(env[idx].value || "");
      const parts = current
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.includes(NEW_SUFFIX)) parts.push(NEW_SUFFIX);
      env[idx] = { name: "CORS_ORIGIN_SUFFIXES", value: parts.join(",") };
    } else {
      env.push({ name: "CORS_ORIGIN_SUFFIXES", value: NEW_SUFFIX });
    }
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
  if (td.proxyConfiguration) input.proxyConfiguration = td.proxyConfiguration;

  const tmp = `.tmp-ecs-td-${td.family}.json`;
  fs.writeFileSync(tmp, JSON.stringify(input));
  const registered = awsJson([
    "ecs",
    "register-task-definition",
    "--cli-input-json",
    `file://${tmp.replace(/\\/g, "/")}`,
    "--output",
    "json",
  ]);
  return registered.taskDefinition.taskDefinitionArn;
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
  if (!svc?.taskDefinition) {
    results.push({ service, skipped: true });
    continue;
  }
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
  results.push({ service, taskDefinition: newArn });
}

console.log(JSON.stringify({ updated: results }, null, 2));
