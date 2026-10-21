/**
 * Hotfix development platform-api CORS_ORIGINS to include Field CloudFront.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAMILY = "forge-development-ecs-platform-api";
const CLUSTER = "forge-development-ecs-platform";
const NEW_ORIGIN = process.env.FORGE_FIELD_ORIGIN || "https://dr716wyn2h1dm.cloudfront.net";
const tmpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-field-cors");

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20_000_000 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `aws failed: ${args.join(" ")}`);
  return JSON.parse(r.stdout);
}

fs.mkdirSync(tmpDir, { recursive: true });

const tdArn = awsJson([
  "ecs",
  "describe-services",
  "--cluster",
  CLUSTER,
  "--services",
  FAMILY,
  "--query",
  "services[0].taskDefinition",
  "--output",
  "json",
]);
const raw = awsJson(["ecs", "describe-task-definition", "--task-definition", tdArn]);
const td = raw.taskDefinition;
const container = td.containerDefinitions[0];
const env = container.environment ?? [];
const cors = env.find((e) => e.name === "CORS_ORIGINS");
if (!cors) throw new Error("CORS_ORIGINS missing on task def");
const origins = cors.value.split(",").map((s) => s.trim()).filter(Boolean);
if (!origins.includes(NEW_ORIGIN)) {
  origins.push(NEW_ORIGIN);
  cors.value = origins.join(",");
  console.log(`Adding ${NEW_ORIGIN} to CORS_ORIGINS`);
} else {
  console.log(`${NEW_ORIGIN} already in CORS_ORIGINS`);
}

const registerInput = {
  family: td.family,
  taskRoleArn: td.taskRoleArn,
  executionRoleArn: td.executionRoleArn,
  networkMode: td.networkMode,
  containerDefinitions: td.containerDefinitions,
  requiresCompatibilities: td.requiresCompatibilities,
  cpu: td.cpu,
  memory: td.memory,
};
if (td.volumes) registerInput.volumes = td.volumes;
if (td.placementConstraints) registerInput.placementConstraints = td.placementConstraints;
if (td.runtimePlatform) registerInput.runtimePlatform = td.runtimePlatform;
if (td.ephemeralStorage) registerInput.ephemeralStorage = td.ephemeralStorage;

const regPath = path.join(tmpDir, "taskdef.json");
fs.writeFileSync(regPath, JSON.stringify(registerInput));
const registered = awsJson([
  "ecs",
  "register-task-definition",
  "--cli-input-json",
  `file://${regPath.replace(/\\/g, "/")}`,
]);
const newArn = registered.taskDefinition.taskDefinitionArn;

awsJson([
  "ecs",
  "update-service",
  "--cluster",
  CLUSTER,
  "--service",
  FAMILY,
  "--task-definition",
  newArn,
  "--force-new-deployment",
]);

console.log(JSON.stringify({ newArn, CORS_ORIGINS: cors.value }, null, 2));
