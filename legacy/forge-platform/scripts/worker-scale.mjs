#!/usr/bin/env node
/**
 * Scale the Forge worker ECS service desired count for cost-controlled testing.
 *
 * Usage:
 *   node scripts/worker-scale.mjs enable development
 *   node scripts/worker-scale.mjs disable development
 */
import { execFileSync } from "node:child_process";

const action = process.argv[2];
const environmentName = process.argv[3] ?? "development";

if (action !== "enable" && action !== "disable") {
  console.error("Usage: node scripts/worker-scale.mjs <enable|disable> [environmentName]");
  process.exit(1);
}

const desiredCount = action === "enable" ? 1 : 0;
const cluster = `forge-${environmentName}-ecs-platform`;
const service = `forge-${environmentName}-ecs-worker-service`;
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const args = [
  "ecs",
  "update-service",
  "--cluster",
  cluster,
  "--service",
  service,
  "--desired-count",
  String(desiredCount),
  "--region",
  region,
  "--output",
  "json",
];

console.log(
  `Setting worker desired count to ${desiredCount} (${cluster} / ${service}) in ${region}...`,
);

try {
  const output = execFileSync("aws", args, { encoding: "utf8" });
  const parsed = JSON.parse(output);
  const serviceInfo = parsed.service ?? parsed;
  console.log(
    JSON.stringify(
      {
        cluster,
        service,
        desiredCount: serviceInfo.desiredCount,
        runningCount: serviceInfo.runningCount,
        status: serviceInfo.status,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to update worker service: ${message}`);
  process.exit(1);
}
