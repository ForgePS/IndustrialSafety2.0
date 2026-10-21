/**
 * READ-ONLY: simulate industrial bootstrap PERSONNEL readiness + probe list columns.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = "producers-rice-mill";

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

async function loadContractsRegistry() {
  // Prefer file path — package exports are ESM-only in some images.
  const candidates = [
    "/app/packages/contracts/dist/industrial.js",
    "/app/node_modules/@forge/contracts/dist/industrial.js",
    "/app/apps/platform-api/node_modules/@forge/contracts/dist/industrial.js",
  ];
  for (const p of candidates) {
    try {
      const mod = await import(pathToFileURL(p).href);
      if (mod?.INDUSTRIAL_MODULE_REGISTRY) return { path: p, registry: mod.INDUSTRIAL_MODULE_REGISTRY };
    } catch {
      /* try next */
    }
  }
  return { path: null, registry: null };
}

async function readBootstrapSnippet() {
  const { readFileSync } = await import("node:fs");
  const candidates = [
    "/app/apps/platform-api/dist/modules/industrial/industrial-bootstrap.service.js",
    "/app/apps/platform-api/src/modules/industrial/industrial-bootstrap.service.js",
  ];
  for (const p of candidates) {
    try {
      const src = readFileSync(p, "utf8");
      return {
        path: p,
        hasDeploymentEnabled: src.includes("deploymentEnabled"),
        hasDefaultOnComment: src.includes("Default ON unless"),
      };
    } catch {
      /* try next */
    }
  }
  return { path: null, hasDeploymentEnabled: null, hasDefaultOnComment: null };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const contracts = await loadContractsRegistry();
    const bootstrapSnippet = await readBootstrapSnippet();
    const personnelEntry = (contracts.registry || []).find((m) => m.code === "PERSONNEL");
    const firstAidEntry = (contracts.registry || []).find((m) => m.code === "FIRST_AID");

    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;

    const flagRows = await sql`
      select fd.key, fd.default_value_json, fo.value_json as override_value,
             (fo.id is not null) as has_override
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenant.id}::uuid
      where fd.key in (
        'industrial.enabled',
        'industrial.module.personnel.enabled',
        'industrial.module.first_aid.enabled',
        'industrial.personnel.seasonalLifecycle.enabled'
      )
      order by fd.key
    `;

    const flagState = new Map();
    for (const row of flagRows) {
      const overridden = Boolean(row.has_override);
      const value = overridden
        ? Boolean(row.override_value === true || row.override_value === "true")
        : Boolean(row.default_value_json === true || row.default_value_json === "true");
      flagState.set(row.key, { value, overridden });
    }
    const deploymentEnabled = (key) => {
      const rec = flagState.get(key);
      if (!rec) return true;
      return rec.overridden ? rec.value : true;
    };

    const industrialEnabled = deploymentEnabled("industrial.enabled");
    const personnelAwsEnabled = deploymentEnabled("industrial.module.personnel.enabled");
    const firstAidAwsEnabled = deploymentEnabled("industrial.module.first_aid.enabled");

    let columnProbe = null;
    try {
      const [row] = await sql`
        select count(*)::int as n,
               count(*) filter (where tracks_first_aid is true)::int as tracked
        from industrial_personnel
        where tenant_id = ${tenant.id}::uuid
      `;
      columnProbe = { ok: true, ...row };
    } catch (e) {
      columnProbe = { ok: false, error: String(e?.message || e) };
    }

    const memberships = await sql`
      select u.primary_email as email, utm.id::text as membership_id,
             coalesce(array_agg(distinct pm.code order by pm.code) filter (where mma.status = 'ACTIVE'), '{}') as modules,
             coalesce(
               array_agg(distinct p.code order by p.code)
                 filter (where p.code like 'industrial.personnel%' or p.code = 'industrial.access'),
               '{}'
             ) as perms
      from user_tenant_memberships utm
      join users u on u.id = utm.user_id
      left join membership_module_access mma on mma.membership_id = utm.id
      left join platform_modules pm on pm.id = mma.module_id
      left join membership_role_assignments mra
        on mra.membership_id = utm.id and mra.status = 'ACTIVE' and mra.revoked_at is null
      left join role_permissions rp on rp.role_id = mra.role_id
      left join permissions p on p.id = rp.permission_id
      where utm.tenant_id = ${tenant.id}::uuid and utm.status = 'ACTIVE'
      group by u.primary_email, utm.id
      order by u.primary_email
    `;

    console.log(
      JSON.stringify(
        {
          contractsPath: contracts.path,
          bootstrapSnippet,
          personnelEntry,
          firstAidEntry,
          flagRows,
          simulated: {
            industrialEnabled,
            personnelAwsEnabled,
            firstAidAwsEnabled,
            directoryWouldShowUnavailable: !(industrialEnabled && personnelAwsEnabled),
          },
          columnProbe,
          memberships,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
