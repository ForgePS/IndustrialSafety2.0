/**
 * Hotfix platform-api CORS_ORIGINS to include Producers hostname.
 * Also patches CDK source separately (forge-platform.ts).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FAMILY = "forge-development-ecs-platform-api";
const NEW_ORIGIN = "https://producers-rice-mill.forgepublicsafety.com";
const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra");

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20_000_000 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `aws failed: ${args.join(" ")}`);
  return JSON.parse(r.stdout);
}

fs.mkdirSync(EVID, { recursive: true });

const tdArn = awsJson([
  "ecs",
  "describe-services",
  "--cluster",
  "forge-development-ecs-platform",
  "--services",
  FAMILY,
  "--query",
  "services[0].taskDefinition",
  "--output",
  "json",
]);
const raw = awsJson(["ecs", "describe-task-definition", "--task-definition", tdArn]);
const td = raw.taskDefinition;
fs.writeFileSync(path.join(EVID, "cors-taskdef-before.json"), `${JSON.stringify(raw, null, 2)}\n`);

const container = td.containerDefinitions[0];
const env = container.environment ?? [];
const cors = env.find((e) => e.name === "CORS_ORIGINS");
if (!cors) throw new Error("CORS_ORIGINS missing on task def");
const origins = cors.value
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!origins.includes(NEW_ORIGIN)) origins.push(NEW_ORIGIN);
cors.value = origins.join(",");

const registerInput = {
  family: td.family,
  taskRoleArn: td.taskRoleArn,
  executionRoleArn: td.executionRoleArn,
  networkMode: td.networkMode,
  containerDefinitions: td.containerDefinitions,
  requiresCompatibilities: td.requiresCompatibilities,
  cpu: td.cpu,
  memory: td.memory,
  volumes: td.volumes,
  placementConstraints: td.placementConstraints,
  runtimePlatform: td.runtimePlatform,
};
if (td.ephemeralStorage) registerInput.ephemeralStorage = td.ephemeralStorage;
if (td.proxyConfiguration) registerInput.proxyConfiguration = td.proxyConfiguration;

const regPath = path.join(EVID, "cors-taskdef-register.json");
fs.writeFileSync(regPath, JSON.stringify(registerInput));
const registered = awsJson([
  "ecs",
  "register-task-definition",
  "--cli-input-json",
  `file://${regPath.replace(/\\/g, "/")}`,
]);
const newArn = registered.taskDefinition.taskDefinitionArn;
fs.writeFileSync(
  path.join(EVID, "cors-taskdef-after.json"),
  `${JSON.stringify({ newArn, CORS_ORIGINS: cors.value }, null, 2)}\n`,
);

awsJson([
  "ecs",
  "update-service",
  "--cluster",
  "forge-development-ecs-platform",
  "--service",
  FAMILY,
  "--task-definition",
  newArn,
  "--force-new-deployment",
]);

console.log(
  JSON.stringify(
    {
      ok: true,
      previousTaskDef: tdArn,
      newTaskDef: newArn,
      corsOrigins: cors.value,
    },
    null,
    2,
  ),
);
