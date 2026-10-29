#!/usr/bin/env node
/**
 * READ-ONLY: compare personnel roster DB counts vs paginated SELECT.
 */
import postgres from "postgres";

const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";

function parseDbUrl(secret) {
  const raw = JSON.parse(secret);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function main() {
  const secret = process.env.DATABASE_SECRET_ARN;
  if (!secret) throw new Error("DATABASE_SECRET_ARN required");
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secret }));
  const sql = postgres(parseDbUrl(res.SecretString), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id, tenant_key
      from tenants
      where tenant_key = ${TENANT_KEY}
      limit 1
    `;
    if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const [counts] = await sql`
      select
        count(*)::int as total_non_archived,
        count(*) filter (where status = 'ACTIVE')::int as active,
        count(*) filter (where status <> 'ACTIVE')::int as not_active,
        count(*) filter (where coalesce(btrim(employee_number), '') = '')::int as missing_employee_number,
        count(distinct id)::int as distinct_ids
      from industrial_personnel
      where tenant_id = ${tenant.id}::uuid
        and archived_at is null
    `;

    const page200 = await sql`
      select count(*)::int as c from (
        select id from industrial_personnel
        where tenant_id = ${tenant.id}::uuid and archived_at is null
        order by
          lower(coalesce(nullif(btrim(first_name), ''), split_part(btrim(display_name), ' ', 1))),
          lower(coalesce(nullif(btrim(last_name), ''), regexp_replace(btrim(display_name), '^.*\\s+', ''))),
          id
        limit 1000 offset 0
      ) s
    `;

    const page200_800 = await sql`
      select count(*)::int as c from (
        select id from industrial_personnel
        where tenant_id = ${tenant.id}::uuid and archived_at is null
        order by
          lower(coalesce(nullif(btrim(first_name), ''), split_part(btrim(display_name), ' ', 1))),
          lower(coalesce(nullif(btrim(last_name), ''), regexp_replace(btrim(display_name), '^.*\\s+', ''))),
          id
        limit 200 offset 800
      ) s
    `;

    const allIds = await sql`
      select id::text as id from industrial_personnel
      where tenant_id = ${tenant.id}::uuid and archived_at is null
      order by
        lower(coalesce(nullif(btrim(first_name), ''), split_part(btrim(display_name), ' ', 1))),
        lower(coalesce(nullif(btrim(last_name), ''), regexp_replace(btrim(display_name), '^.*\\s+', ''))),
        id
      limit 1000 offset 0
    `;

    const dupCheck = await sql`
      select count(*)::int as duplicate_id_rows
      from (
        select id, count(*) as c
        from industrial_personnel
        where tenant_id = ${tenant.id}::uuid and archived_at is null
        group by id
        having count(*) > 1
      ) d
    `;

    const siteNull = await sql`
      select count(*)::int as c
      from industrial_personnel
      where tenant_id = ${tenant.id}::uuid
        and archived_at is null
        and site_id is null
    `;

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          counts,
          page1000_offset0: page200.c,
          page200_offset800: page200_800.c,
          idsReturnedLimit1000: allIds.length,
          duplicateIdGroups: dupCheck.duplicate_id_rows,
          missingSiteId: siteNull.c,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
