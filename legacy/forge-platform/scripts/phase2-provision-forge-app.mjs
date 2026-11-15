#!/usr/bin/env node
/**
 * Provision forge_app runtime credentials on Aurora and store in Secrets Manager.
 * Keeps forge_admin as Aurora master for migrations; API/worker should use the app secret.
 *
 * Creates/updates: forge-development-secrets-database-app
 * Then prints ARN for CDK / task-definition wiring.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { runPlatformApiOneOff, awsJson, awsText } from "./ecs-oneoff.mjs";

const region = process.env.AWS_REGION || "us-east-1";
const appSecretName =
  process.env.FORGE_APP_DB_SECRET_NAME || "forge-development-secrets-database-app";

function sh(args, opts = {}) {
  const result = spawnSync("aws", args, {
    encoding: "utf8",
    shell: opts.shell ?? false,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `aws ${args[0]} failed`);
  }
  return result.stdout;
}

// Read master secret ARN from the running API task definition env.
const cluster = awsText([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  "Forge-Development-Compute",
  "--query",
  "Stacks[0].Outputs[?OutputKey=='ForgeComputeClusterName'].OutputValue",
]);
const service = "forge-development-ecs-platform-api";
const desc = awsJson(["ecs", "describe-services", "--cluster", cluster, "--services", service]);
const taskDefArn = desc.services[0].taskDefinition;
const taskDef = awsJson(["ecs", "describe-task-definition", "--task-definition", taskDefArn]);
const envPairs = taskDef.taskDefinition.containerDefinitions[0].environment || [];
const adminSecretArn = envPairs.find((e) => e.name === "DATABASE_SECRET_ARN")?.value;
if (!adminSecretArn) throw new Error("DATABASE_SECRET_ARN missing on API task");

const adminSecret = JSON.parse(
  sh([
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    adminSecretArn,
    "--query",
    "SecretString",
    "--output",
    "text",
  ]),
);

const password = randomBytes(24).toString("base64url");
const appSecretPayload = {
  username: "forge_app",
  password,
  host: adminSecret.host || adminSecret.hostname,
  port: Number(adminSecret.port || 5432),
  dbname: adminSecret.dbname || adminSecret.database || "forge_platform",
  engine: "postgres",
};

// Ensure role password matches without printing the password.
const alterScript = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { createDatabase } from "@forge/database";
import { sql } from "drizzle-orm";

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const password = ${JSON.stringify(password)};
await db.execute(sql.raw("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN CREATE ROLE forge_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;"));
await db.execute(sql.raw("ALTER ROLE forge_app WITH LOGIN PASSWORD '" + password.replace(/'/g, "''") + "'"));
await db.execute(sql.raw("GRANT USAGE ON SCHEMA public TO forge_app"));
await db.execute(sql.raw("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forge_app"));
await db.execute(sql.raw("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forge_app"));
const who = await db.execute(sql\`select rolname, rolcanlogin from pg_roles where rolname = 'forge_app'\`);
console.info(JSON.stringify({ ok: true, forge_app: who }));
process.exit(0);
`;

const { taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", alterScript],
  "provision-forge-app-role",
);
console.log("Waiting for forge_app ALTER ROLE…");
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  stdio: "inherit",
});

const taskResult = awsJson([
  "ecs",
  "describe-tasks",
  "--cluster",
  cluster,
  "--tasks",
  taskArn,
  "--query",
  "tasks[0].containers[0].exitCode",
]);
if (taskResult !== 0) {
  console.error("ALTER ROLE task failed", taskResult);
  process.exit(1);
}

// Upsert app secret (do not print SecretString).
let appSecretArn;
try {
  sh([
    "secretsmanager",
    "describe-secret",
    "--secret-id",
    appSecretName,
    "--query",
    "ARN",
    "--output",
    "text",
  ]);
  sh([
    "secretsmanager",
    "put-secret-value",
    "--secret-id",
    appSecretName,
    "--secret-string",
    JSON.stringify(appSecretPayload),
  ]);
  appSecretArn = sh([
    "secretsmanager",
    "describe-secret",
    "--secret-id",
    appSecretName,
    "--query",
    "ARN",
    "--output",
    "text",
  ]).trim();
} catch {
  const created = JSON.parse(
    sh(
      [
        "secretsmanager",
        "create-secret",
        "--name",
        appSecretName,
        "--description",
        "Aurora forge_app runtime credentials for API and worker",
        "--secret-string",
        JSON.stringify(appSecretPayload),
      ],
      { shell: false },
    ),
  );
  appSecretArn = created.ARN;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      appSecretName,
      appSecretArn,
      username: "forge_app",
      host: appSecretPayload.host,
      dbname: appSecretPayload.dbname,
      note: "Point API/worker DATABASE_SECRET_ARN at appSecretArn and force a new ECS deployment.",
    },
    null,
    2,
  ),
);
