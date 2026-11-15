/**
 * Targeted additive DDL for development Field login failures.
 * Dev RDS is behind Drizzle (full migrate blocked on industrial_sites.site_key).
 *
 * Covers:
 * - subscriptions: billing_customer_id, billing_type, seat_quantity (0030)
 * - industrial_personnel: columns from 0041/0043/0044/0045/0048/0049/0053/0068 + source_payload/site_id/department_id
 * - industrial_sites.site_key (unblock future migrate)
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

const EXPECTED = {
  subscriptions: ["billing_customer_id", "billing_type", "seat_quantity"],
  industrial_personnel: [
    "site_id",
    "department_id",
    "position_id",
    "employment_type_id",
    "middle_name",
    "suffix",
    "company_phone",
    "company_email",
    "supervisor_name",
    "department_name",
    "company_name",
    "division_name",
    "file_base",
    "user_auth_id",
    "digital_source",
    "is_company_driver",
    "is_dot_driver",
    "tracks_prescription_safety_glasses",
    "prescription_safety_glasses_issued_date",
    "prescription_safety_glasses_expires_date",
    "prescription_safety_glasses_extra_pair_approved",
    "prescription_safety_glasses_extra_pair_approved_by",
    "prescription_safety_glasses_extra_pair_approved_date",
    "prescription_safety_glasses_extra_pair_reason",
    "safety_footwear_class",
    "safety_footwear_issued_date",
    "safety_footwear_expires_date",
    "safety_footwear_extra_pair_approved",
    "safety_footwear_extra_pair_approved_by",
    "safety_footwear_extra_pair_approved_date",
    "safety_footwear_extra_pair_reason",
    "tracks_first_aid",
    "cpr_certification_expires_date",
    "first_aid_certification_expires_date",
    "notes",
    "signature_url",
    "allergies",
    "medical_history",
    "emergency_contact_1_name",
    "emergency_contact_1_phone",
    "emergency_contact_1_relationship",
    "emergency_contact_2_name",
    "emergency_contact_2_phone",
    "emergency_contact_2_relationship",
    "source_payload",
  ],
  industrial_sites: ["site_key"],
};

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

async function columnPresence(sql, table, columns) {
  const rows = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
      and column_name = any(${columns})
  `;
  const present = new Set(rows.map((r) => r.column_name));
  return {
    present: columns.filter((c) => present.has(c)),
    missing: columns.filter((c) => !present.has(c)),
  };
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

const DDL = `
-- 0030 subscriptions billing fields
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_customer_id" uuid,
  ADD COLUMN IF NOT EXISTS "billing_type" varchar(64) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "seat_quantity" integer;

-- Unblock migrate chain: industrial_sites.site_key
ALTER TABLE "industrial_sites"
  ADD COLUMN IF NOT EXISTS "site_key" varchar(120);

-- industrial_personnel: FK + org fields (0040/0041 style, additive)
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "site_id" uuid,
  ADD COLUMN IF NOT EXISTS "department_id" uuid,
  ADD COLUMN IF NOT EXISTS "position_id" uuid,
  ADD COLUMN IF NOT EXISTS "employment_type_id" uuid,
  ADD COLUMN IF NOT EXISTS "hire_date" date,
  ADD COLUMN IF NOT EXISTS "phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "supervisor_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 0043 person template
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "middle_name" varchar(150),
  ADD COLUMN IF NOT EXISTS "suffix" varchar(32),
  ADD COLUMN IF NOT EXISTS "preferred_name" varchar(150),
  ADD COLUMN IF NOT EXISTS "job_title" varchar(300),
  ADD COLUMN IF NOT EXISTS "department_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "file_base" varchar(300),
  ADD COLUMN IF NOT EXISTS "company_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "division_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "user_auth_id" varchar(320),
  ADD COLUMN IF NOT EXISTS "digital_source" varchar(200),
  ADD COLUMN IF NOT EXISTS "is_company_driver" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "signature_url" text;

-- 0044 company contact
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "company_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "company_email" varchar(320);

-- 0045 medical / emergency
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "allergies" text,
  ADD COLUMN IF NOT EXISTS "medical_history" text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "emergency_contact_1_relationship" varchar(120),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "emergency_contact_2_relationship" varchar(120);

-- 0048 / 0049 PPE
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "tracks_prescription_safety_glasses" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "safety_footwear_class" varchar(32),
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_issued_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_expires_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved_by" varchar(300),
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_approved_date" date,
  ADD COLUMN IF NOT EXISTS "prescription_safety_glasses_extra_pair_reason" text,
  ADD COLUMN IF NOT EXISTS "safety_footwear_issued_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_expires_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved_by" varchar(300),
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_approved_date" date,
  ADD COLUMN IF NOT EXISTS "safety_footwear_extra_pair_reason" text;

-- 0053 first aid
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "tracks_first_aid" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cpr_certification_expires_date" date,
  ADD COLUMN IF NOT EXISTS "first_aid_certification_expires_date" date;

-- 0068 DOT driver
ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "is_dot_driver" boolean NOT NULL DEFAULT false;
`;

try {
  const before = {};
  for (const [table, cols] of Object.entries(EXPECTED)) {
    before[table] = await columnPresence(sql, table, cols);
  }

  const actions = [];
  if (APPLY) {
    await sql.unsafe(DDL);
    actions.push("applied_field_login_schema_gaps");

    // Optional FKs — ignore if already present or parent missing
    const fkStatements = [
      `DO $$ BEGIN
        ALTER TABLE "industrial_personnel"
          ADD CONSTRAINT "industrial_personnel_site_id_fkey"
          FOREIGN KEY ("site_id") REFERENCES "industrial_sites"("id");
      EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;`,
      `DO $$ BEGIN
        ALTER TABLE "industrial_personnel"
          ADD CONSTRAINT "industrial_personnel_department_id_fkey"
          FOREIGN KEY ("department_id") REFERENCES "industrial_departments"("id");
      EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;`,
      `DO $$ BEGIN
        ALTER TABLE "industrial_personnel"
          ADD CONSTRAINT "industrial_personnel_position_id_fkey"
          FOREIGN KEY ("position_id") REFERENCES "industrial_positions"("id");
      EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;`,
      `DO $$ BEGIN
        ALTER TABLE "industrial_personnel"
          ADD CONSTRAINT "industrial_personnel_employment_type_id_fkey"
          FOREIGN KEY ("employment_type_id") REFERENCES "industrial_employment_types"("id");
      EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;`,
    ];
    for (const stmt of fkStatements) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        actions.push(`fk_skip:${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    actions.push("dry_run");
  }

  const after = {};
  for (const [table, cols] of Object.entries(EXPECTED)) {
    after[table] = await columnPresence(sql, table, cols);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "APPLY-DEV-SCHEMA-GAPS-FIELD-LOGIN",
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
