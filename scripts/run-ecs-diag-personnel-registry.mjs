#!/usr/bin/env node
/**
 * Print INDUSTRIAL_MODULE_REGISTRY PERSONNEL/FIRST_AID from the running API image
 * and related feature flag effective state for producers-rice-mill.
 */
import { spawnSync } from "node:child_process";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  ADMIN_SECRET_NAME,
  "--query",
  "ARN",
]);

const evalCode = [
  `import { createRequire } from "node:module";`,
  `import { pathToFileURL } from "node:url";`,
  `const apiRequire = createRequire("/app/apps/platform-api/package.json");`,
  `const contracts = apiRequire("@forge/contracts");`,
  `const registry = contracts.INDUSTRIAL_MODULE_REGISTRY || [];`,
  `const wanted = registry.filter((m) => m.code === "PERSONNEL" || m.code === "FIRST_AID");`,
  `const { SecretsManagerClient, GetSecretValueCommand } = apiRequire("@aws-sdk/client-secrets-manager");`,
  `const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");`,
  `const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);`,
  `const postgres = postgresMod.default ?? postgresMod;`,
  `const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });`,
  `const res = await client.send(new GetSecretValueCommand({ SecretId: process.env.DATABASE_SECRET_ARN }));`,
  `const raw = JSON.parse(res.SecretString);`,
  `const host = raw.host ?? raw.hostname;`,
  `const dbname = raw.dbname ?? raw.database;`,
  `const port = Number(raw.port ?? 5432);`,
  `const sql = postgres(\`postgresql://\${encodeURIComponent(raw.username)}:\${encodeURIComponent(raw.password)}@\${host}:\${port}/\${dbname}\`, { max: 1 });`,
  `try {`,
  `  const tenantId = (await sql\`select id::text as id from tenants where tenant_key = 'producers-rice-mill' limit 1\`)[0].id;`,
  `  const flags = await sql\``,
  `    select fd.key, fd.default_value_json, fo.value_json as override_value,`,
  `           (fo.id is not null) as has_override`,
  `    from feature_definitions fd`,
  `    left join feature_overrides fo on fo.feature_definition_id = fd.id and fo.tenant_id = \${tenantId}::uuid`,
  `    where fd.key like 'industrial%'`,
  `    order by fd.key`,
  `  \`;`,
  `  console.log(JSON.stringify({ registryWanted: wanted, registryCount: registry.length, flags }, null, 2));`,
  `} finally { await sql.end({ timeout: 5 }); }`,
].join("\n");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-personnel-registry",
  {
    forgeEnvironment: "production",
    environment: { DATABASE_SECRET_ARN: adminSecretArn },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();
const out = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    LOG_GROUP,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "100",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
const logs = (JSON.parse(out.stdout || "{}").events || []).map((e) => e.message).join("\n");
process.stdout.write(logs + "\n");
process.exit(exitCode ?? 1);
