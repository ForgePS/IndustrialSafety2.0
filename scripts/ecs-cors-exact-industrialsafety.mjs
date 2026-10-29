/**
 * Hotfix: add producersrice.forgeindustrialsafety.com to CORS_ORIGINS on
 * production API (+ worker). Dual-serve until SPA is same-origin /api.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const CLUSTER = "forge-production-ecs-platform";
const SERVICES = [
  "forge-production-ecs-platform-api",
  "forge-production-ecs-worker-service",
];
const NEW_ORIGIN = "https://producersrice.forgeindustrialsafety.com";

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
    const idx = env.findIndex((e) => e.name === "CORS_ORIGINS");
    if (idx >= 0) {
      const parts = String(env[idx].value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.includes(NEW_ORIGIN)) parts.push(NEW_ORIGIN);
      env[idx] = { name: "CORS_ORIGINS", value: parts.join(",") };
    } else {
      env.push({ name: "CORS_ORIGINS", value: NEW_ORIGIN });
    }
    // Keep industrialsafety suffix too.
    const sidx = env.findIndex((e) => e.name === "CORS_ORIGIN_SUFFIXES");
    const want = [".forgepublicsafety.com", ".forgeindustrialsafety.com"];
    if (sidx >= 0) {
      const parts = String(env[sidx].value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const w of want) if (!parts.includes(w)) parts.push(w);
      env[sidx] = { name: "CORS_ORIGIN_SUFFIXES", value: parts.join(",") };
    } else {
      env.push({ name: "CORS_ORIGIN_SUFFIXES", value: want.join(",") });
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

  const tmp = `.tmp-ecs-td-cors-exact-${td.family}.json`;
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
  results.push({ service, taskDefinition: newArn });
}
console.log(JSON.stringify({ updated: results }, null, 2));
