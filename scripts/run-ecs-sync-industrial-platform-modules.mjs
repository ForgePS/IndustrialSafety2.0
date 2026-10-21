#!/usr/bin/env node
/**
 * Sync missing FORGE_INDUSTRIAL platform_modules from the contracts catalog.
 *
 * Dry-run:
 *   node scripts/run-ecs-sync-industrial-platform-modules.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-sync-industrial-platform-modules.mjs
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const FORGE_ENV = process.env.FORGE_ENV === "development" ? "development" : "production";
const isProd = FORGE_ENV === "production";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME ||
  (isProd ? "forge-production-secrets-database" : "forge-development-secrets-database");
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET ||
  (isProd
    ? "forge-production-imports-511343547817-us-east-1"
    : "forge-development-imports-511343547817-us-east-1");
const LOG_GROUP =
  process.env.FORGE_API_LOG_GROUP ||
  (isProd ? "/forge/production/platform-api" : "/forge/development/platform-api");

const require = createRequire(import.meta.url);
const { catalogModulesForSeed } = require("../packages/contracts/dist/module-catalog.js");
const catalog = catalogModulesForSeed("FORGE_INDUSTRIAL");

const prefix = `sync/industrial-platform-modules/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/sync-industrial-platform-modules.mjs`;
const localPayload = path.resolve(".forge-sync-industrial-platform-modules.mjs");

const script = `/**
 * Generated one-off sync for FORGE_INDUSTRIAL platform_modules.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const PRODUCT_CODE = "FORGE_INDUSTRIAL";
const CATALOG = ${JSON.stringify(catalog, null, 2)};

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return \`postgresql://\${encodeURIComponent(raw.username)}:\${encodeURIComponent(raw.password)}@\${host}:\${port}/\${dbname}\`;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const [product] = await sql\`
    select id::text as id from platform_products where code = \${PRODUCT_CODE} limit 1
  \`;
  if (!product) throw new Error(\`\${PRODUCT_CODE} product missing\`);

  const existing = await sql\`
    select code from platform_modules where product_id = \${product.id}::uuid
  \`;
  const existingCodes = new Set(existing.map((row) => row.code));
  const missing = CATALOG.filter((mod) => !existingCodes.has(mod.code));
  const report = {
    apply: APPLY,
    productCode: PRODUCT_CODE,
    existingCount: existingCodes.size,
    catalogCount: CATALOG.length,
    missingCount: missing.length,
    missing: missing.map((mod) => mod.code),
    inserted: [],
  };

  if (APPLY) {
    for (const mod of missing) {
      const id = randomUUID();
      await sql\`
        insert into platform_modules (
          id, product_id, code, name, description, status, is_core,
          category, classification, implementation_status, customer_assignable,
          display_order, created_at, updated_at
        ) values (
          \${id}::uuid,
          \${product.id}::uuid,
          \${mod.code},
          \${mod.name},
          \${mod.description ?? null},
          'ACTIVE',
          \${mod.isCore},
          \${mod.category},
          \${mod.classification},
          \${mod.implementationStatus},
          \${mod.customerAssignable},
          \${mod.displayOrder},
          now(),
          now()
        )
        on conflict do nothing
      \`;
      report.inserted.push(mod.code);
    }
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
`;

writeFileSync(localPayload, script, "utf8");

const up = spawnSync("aws", ["s3", "cp", localPayload, `s3://${IMPORTS_BUCKET}/${key}`], {
  encoding: "utf8",
  shell: true,
});
try {
  unlinkSync(localPayload);
} catch {
  // ignore
}
if (up.status !== 0) {
  console.error(up.stderr || up.stdout);
  process.exit(1);
}

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  ADMIN_SECRET_NAME,
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(IMPORTS_BUCKET)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/sync-industrial-platform-modules.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/sync-industrial-platform-modules.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `sync-industrial-modules-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      APPLY,
    },
  },
);

console.log(JSON.stringify({ ok: true, apply: APPLY === "1", cluster, taskArn, logGroup: LOG_GROUP }, null, 2));
