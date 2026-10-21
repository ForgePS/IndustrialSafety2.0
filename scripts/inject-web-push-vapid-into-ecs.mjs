#!/usr/bin/env node
/**
 * Inject WEB_PUSH_VAPID_* secrets into the live platform-api task definition
 * and force a service rollout. Does not print secret values.
 *
 * Usage:
 *   node scripts/inject-web-push-vapid-into-ecs.mjs --env development
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? "development" : args[envIndex + 1];
const ALLOW_PRODUCTION = args.includes("--allow-production");

if (!["development", "production"].includes(forgeEnvironment)) {
  console.error("Usage: node scripts/inject-web-push-vapid-into-ecs.mjs --env <development|production>");
  process.exit(1);
}
if (forgeEnvironment === "production" && !ALLOW_PRODUCTION) {
  console.error("Refusing production without --allow-production");
  process.exit(1);
}

function awsJson(argv) {
  const result = spawnSync("aws", [...argv, "--output", "json"], {
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "aws failed");
  }
  return JSON.parse(result.stdout);
}

function awsText(argv) {
  const result = spawnSync("aws", [...argv, "--output", "text"], {
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "aws failed");
  }
  return result.stdout.trim();
}

const secretName = `forge-${forgeEnvironment}-secrets-web-push-vapid`;
const secretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  secretName,
  "--query",
  "ARN",
]);
const cluster = `forge-${forgeEnvironment}-ecs-platform`;
const service = `forge-${forgeEnvironment}-ecs-platform-api`;
const family = `forge-${forgeEnvironment}-ecs-platform-api`;
const execRole = `forge-${forgeEnvironment}-iam-api-exec`;
const taskRole = `forge-${forgeEnvironment}-iam-api-task`;
const policyName = "WebPushVapidRead";

const policyDoc = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      Resource: secretArn,
    },
  ],
};

const policyFile = join(process.cwd(), `.forge-web-push-policy-${Date.now()}.json`);
const taskDefFile = join(process.cwd(), `.forge-web-push-taskdef-${Date.now()}.json`);
writeFileSync(policyFile, JSON.stringify(policyDoc));

try {
  for (const role of [execRole, taskRole]) {
    const put = spawnSync(
      "aws",
      [
        "iam",
        "put-role-policy",
        "--role-name",
        role,
        "--policy-name",
        policyName,
        "--policy-document",
        `file://${policyFile}`,
      ],
      { encoding: "utf8", shell: true },
    );
    if (put.status !== 0) {
      console.error(put.stderr || put.stdout);
      process.exit(1);
    }
  }

  const described = awsJson(["ecs", "describe-task-definition", "--task-definition", family]);
  const td = described.taskDefinition;
  const container = td.containerDefinitions[0];
  const existingSecrets = Array.isArray(container.secrets) ? container.secrets : [];
  const withoutPush = existingSecrets.filter(
    (s) =>
      ![
        "WEB_PUSH_VAPID_PUBLIC_KEY",
        "WEB_PUSH_VAPID_PRIVATE_KEY",
        "WEB_PUSH_VAPID_SUBJECT",
      ].includes(s.name),
  );

  container.secrets = [
    ...withoutPush,
    { name: "WEB_PUSH_VAPID_PUBLIC_KEY", valueFrom: `${secretArn}:publicKey::` },
    { name: "WEB_PUSH_VAPID_PRIVATE_KEY", valueFrom: `${secretArn}:privateKey::` },
    { name: "WEB_PUSH_VAPID_SUBJECT", valueFrom: `${secretArn}:subject::` },
  ];

  const registerPayload = {
    family: td.family,
    taskRoleArn: td.taskRoleArn,
    executionRoleArn: td.executionRoleArn,
    networkMode: td.networkMode,
    containerDefinitions: td.containerDefinitions,
    requiresCompatibilities: td.requiresCompatibilities,
    cpu: td.cpu,
    memory: td.memory,
  };
  if (td.volumes?.length) registerPayload.volumes = td.volumes;
  if (td.placementConstraints?.length) registerPayload.placementConstraints = td.placementConstraints;
  if (td.runtimePlatform) registerPayload.runtimePlatform = td.runtimePlatform;
  if (td.proxyConfiguration) registerPayload.proxyConfiguration = td.proxyConfiguration;
  if (td.ipcMode) registerPayload.ipcMode = td.ipcMode;
  if (td.pidMode) registerPayload.pidMode = td.pidMode;
  if (td.ephemeralStorage) registerPayload.ephemeralStorage = td.ephemeralStorage;

  writeFileSync(taskDefFile, JSON.stringify(registerPayload));
  const registered = awsJson([
    "ecs",
    "register-task-definition",
    "--cli-input-json",
    `file://${taskDefFile}`,
  ]);

  const newArn = registered.taskDefinition.taskDefinitionArn;
  const revision = registered.taskDefinition.revision;

  awsJson([
    "ecs",
    "update-service",
    "--cluster",
    cluster,
    "--service",
    service,
    "--task-definition",
    newArn,
    "--force-new-deployment",
  ]);

  console.log(
    JSON.stringify({
      status: "updated",
      forgeEnvironment,
      secretName,
      cluster,
      service,
      taskDefinition: newArn,
      revision,
      injected: [
        "WEB_PUSH_VAPID_PUBLIC_KEY",
        "WEB_PUSH_VAPID_PRIVATE_KEY",
        "WEB_PUSH_VAPID_SUBJECT",
      ],
      iamPolicy: policyName,
      roles: [execRole, taskRole],
    }),
  );
} finally {
  try {
    unlinkSync(policyFile);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(taskDefFile);
  } catch {
    /* ignore */
  }
}
