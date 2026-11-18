#!/usr/bin/env node
/**
 * Map Field/Industrial CloudFront hosts to Producers Rice Mill (read/write).
 * Run via: node scripts/run-ecs-seed-field-domains.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const DOMAINS = (
  process.env.DOMAINS ||
  "d2qv0f0hojgvqo.cloudfront.net,d1n0e5wvjwbpdf.cloudfront.net,dr716wyn2h1dm.cloudfront.net"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

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

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
try {
  const [tenant] = await sql`
    select id::text as id, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);

  const results = [];
  const now = new Date();
  for (const domain of DOMAINS) {
    const [existing] = await sql`
      select id::text as id, tenant_id::text as tenant_id, verification_status
      from tenant_domains
      where domain = ${domain}
      limit 1
    `;
    if (existing) {
      if (existing.tenant_id !== tenant.id) {
        throw new Error(`domain ${domain} mapped to ${existing.tenant_id}, expected ${tenant.id}`);
      }
      if (existing.verification_status !== "VERIFIED") {
        await sql`
          update tenant_domains
          set verification_status = 'VERIFIED', verified_at = ${now}, updated_at = ${now}
          where id = ${existing.id}::uuid
        `;
      }
      results.push({ domain, created: false, verified: true });
      continue;
    }
    await sql`
      insert into tenant_domains (
        id, tenant_id, domain, domain_type, verification_status, verified_at, created_at, updated_at
      ) values (
        ${randomUUID()}::uuid,
        ${tenant.id}::uuid,
        ${domain},
        'CUSTOM',
        'VERIFIED',
        ${now},
        ${now},
        ${now}
      )
    `;
    results.push({ domain, created: true, verified: true });
  }
  console.log(JSON.stringify({ tenant, results }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
