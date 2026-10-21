/**
 * Targeted additive DDL for development Field LOTO 500s.
 * Dev RDS is behind Drizzle (full migrate blocked). LOTO list queries fail when
 * industrial_loto_* / user_notifications tables are missing or ungranted.
 *
 * APPLY=1 to execute. Dry-run otherwise.
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

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

const TABLES = [
  "industrial_sites",
  "industrial_equipment",
  "industrial_loto_libraries",
  "industrial_loto_procedures",
  "industrial_loto_energy_sources",
  "industrial_loto_isolation_points",
  "industrial_loto_steps",
  "industrial_loto_procedure_revisions",
  "industrial_loto_records",
  "user_notifications",
];

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

async function tableExists(sql, name) {
  const rows = await sql`
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
  `;
  return rows.length > 0;
}

function sourceCols() {
  return `
    "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
    "source_project" varchar(128),
    "source_collection" varchar(128),
    "source_document_id" varchar(256),
    "source_path" varchar(512),
    "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb
  `;
}

function rls(table) {
  return `
GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO forge_app;
ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}";
CREATE POLICY "${table}_tenant_isolation" ON "${table}"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
`;
}

const DDL = `
CREATE TABLE IF NOT EXISTS "industrial_loto_libraries" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kind" varchar(64) NOT NULL,
  "short_name" varchar(200),
  "text" text,
  "active" boolean NOT NULL DEFAULT true,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_libraries")}

CREATE TABLE IF NOT EXISTS "industrial_loto_procedures" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid,
  "equipment_id" uuid,
  "title" varchar(500) NOT NULL,
  "procedure_number" varchar(120),
  "revision" varchar(64),
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_procedures")}

CREATE TABLE IF NOT EXISTS "industrial_loto_energy_sources" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL,
  "energy_type" varchar(120) NOT NULL,
  "description" text,
  "magnitude" varchar(120),
  "sort_order" integer NOT NULL DEFAULT 0,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_energy_sources")}

CREATE TABLE IF NOT EXISTS "industrial_loto_isolation_points" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL,
  "energy_source_id" uuid,
  "label" varchar(300) NOT NULL,
  "location_description" text,
  "isolation_method" varchar(200),
  "sort_order" integer NOT NULL DEFAULT 0,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_isolation_points")}

CREATE TABLE IF NOT EXISTS "industrial_loto_steps" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL,
  "step_phase" varchar(32) NOT NULL,
  "step_number" integer NOT NULL DEFAULT 1,
  "instruction" text NOT NULL,
  "isolation_point_id" uuid,
  "library_item_id" uuid,
  "is_verification" boolean NOT NULL DEFAULT false,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_steps")}

CREATE TABLE IF NOT EXISTS "industrial_loto_procedure_revisions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL,
  "revision" varchar(64) NOT NULL,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changed_summary" text,
  "created_by_user_id" uuid,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_procedure_revisions")}

CREATE TABLE IF NOT EXISTS "industrial_loto_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid,
  "procedure_id" uuid,
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "due_date" date,
  ${sourceCols()},
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
${rls("industrial_loto_records")}

CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" varchar(120) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "priority" varchar(32) NOT NULL DEFAULT 'NORMAL',
  "destination" varchar(32) NOT NULL DEFAULT 'IN_APP',
  "href" varchar(500),
  "read_at" timestamptz,
  "expires_at" timestamptz,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
${rls("user_notifications")}

ALTER TABLE "industrial_loto_procedures"
  ADD COLUMN IF NOT EXISTS "site_id" uuid,
  ADD COLUMN IF NOT EXISTS "equipment_id" uuid,
  ADD COLUMN IF NOT EXISTS "procedure_number" varchar(120),
  ADD COLUMN IF NOT EXISTS "revision" varchar(64),
  ADD COLUMN IF NOT EXISTS "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  ADD COLUMN IF NOT EXISTS "source_project" varchar(128),
  ADD COLUMN IF NOT EXISTS "source_collection" varchar(128),
  ADD COLUMN IF NOT EXISTS "source_document_id" varchar(256),
  ADD COLUMN IF NOT EXISTS "source_path" varchar(512),
  ADD COLUMN IF NOT EXISTS "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;

ALTER TABLE "industrial_loto_records"
  ADD COLUMN IF NOT EXISTS "site_id" uuid,
  ADD COLUMN IF NOT EXISTS "procedure_id" uuid,
  ADD COLUMN IF NOT EXISTS "title" varchar(500),
  ADD COLUMN IF NOT EXISTS "due_date" date,
  ADD COLUMN IF NOT EXISTS "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  ADD COLUMN IF NOT EXISTS "source_project" varchar(128),
  ADD COLUMN IF NOT EXISTS "source_collection" varchar(128),
  ADD COLUMN IF NOT EXISTS "source_document_id" varchar(256),
  ADD COLUMN IF NOT EXISTS "source_path" varchar(512),
  ADD COLUMN IF NOT EXISTS "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
`;

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const before = {};
  for (const name of TABLES) {
    before[name] = await tableExists(sql, name);
  }

  const actions = [];
  if (APPLY) {
    await sql.unsafe(DDL);
    actions.push("applied_loto_field_schema_gaps");
  } else {
    actions.push("dry_run");
  }

  const after = {};
  for (const name of TABLES) {
    after[name] = await tableExists(sql, name);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "APPLY-DEV-SCHEMA-GAPS-LOTO-FIELD",
        apply: APPLY,
        before,
        actions,
        after,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
