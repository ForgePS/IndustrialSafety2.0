/**
 * Sync FORGE_INDUSTRIAL platform_modules from the contracts catalog.
 * Inserts any registry modules missing from production/dev DB.
 *
 * Dry-run:
 *   node scripts/sync-industrial-platform-modules.mjs
 * Apply:
 *   APPLY=1 node scripts/sync-industrial-platform-modules.mjs
 *
 * Intended to run inside platform-api ECS (DATABASE_SECRET_ARN required).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const contracts = apiRequire("@forge/contracts");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const PRODUCT_CODE = "FORGE_INDUSTRIAL";

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [product] = await sql`
      select id::text as id from platform_products where code = ${PRODUCT_CODE} limit 1
    `;
    if (!product) throw new Error(`${PRODUCT_CODE} product missing`);

    const existing = await sql`
      select code from platform_modules where product_id = ${product.id}::uuid
    `;
    const existingCodes = new Set(existing.map((row) => row.code));

    const catalog = contracts.catalogModulesForSeed(PRODUCT_CODE);
    const missing = catalog.filter((mod) => !existingCodes.has(mod.code));
    const report = {
      apply: APPLY,
      productCode: PRODUCT_CODE,
      existingCount: existingCodes.size,
      catalogCount: catalog.length,
      missingCount: missing.length,
      missing: missing.map((mod) => mod.code),
      inserted: [],
    };

    if (APPLY) {
      for (const mod of missing) {
        const id = randomUUID();
        await sql`
          insert into platform_modules (
            id, product_id, code, name, description, status, is_core,
            category, classification, implementation_status, customer_assignable,
            display_order, created_at, updated_at
          ) values (
            ${id}::uuid,
            ${product.id}::uuid,
            ${mod.code},
            ${mod.name},
            ${mod.description ?? null},
            'ACTIVE',
            ${mod.isCore},
            ${mod.category},
            ${mod.classification},
            ${mod.implementationStatus},
            ${mod.customerAssignable},
            ${mod.displayOrder},
            now(),
            now()
          )
          on conflict do nothing
        `;
        report.inserted.push(mod.code);
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
