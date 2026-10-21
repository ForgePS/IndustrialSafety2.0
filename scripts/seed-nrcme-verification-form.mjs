#!/usr/bin/env node
/**
 * Upsert Medical Examiner's National Registry Verification Form for
 * producers-rice-mill so DQF worksheet FormLinkActions can resolve it.
 *
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-nrcme-verification-form.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-nrcme-verification-form.mjs
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const TITLE = "Medical Examiner's National Registry Verification Form";
const SOURCE_DOCUMENT_ID = "forge-dqf-nrcme-verification-form";
const SOURCE_COLLECTION = "forgeSeededForms";
const FORM_KEY = "medical-examiner-national-registry-verification";

const SCHEMA = {
  category: "DOT / DQF",
  description:
    "Document verification that the medical examiner who issued the MEC is listed on the FMCSA National Registry.",
  fields: [
    { id: "driverName", label: "DRIVER Name", type: "text", required: true },
    { id: "employeeNumber", label: "EMPLOYEE Number", type: "employeeNumber" },
    {
      id: "medicalExaminerName",
      label: "Medical Examiner Name",
      type: "text",
      required: true,
    },
    {
      id: "medicalExaminerRegistrationNumber",
      label: "Medical Examiner's Registration Number",
      type: "text",
      required: true,
    },
    {
      id: "nationalRegistryNumber",
      label: "National Registry Number",
      type: "text",
    },
    {
      id: "verificationDate",
      label: "Date Verified on National Registry",
      type: "date",
      required: true,
    },
    {
      id: "verifiedOnRegistry",
      label: "Medical examiner verified on FMCSA National Registry?",
      type: "yesno",
      required: true,
    },
    {
      id: "verificationNotes",
      label: "Notes",
      type: "textarea",
    },
    {
      id: "verifiedByName",
      label: "Verified by (printed name)",
      type: "text",
      required: true,
    },
    {
      id: "verifiedBySignature",
      label: "Verifier signature",
      type: "signature",
      required: true,
    },
  ],
};

function deterministicUuid(parts) {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const tenantRows = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error(`tenant not found: ${TENANT_KEY}`);

  const id = deterministicUuid(["form-def", tenantId, SOURCE_COLLECTION, SOURCE_DOCUMENT_ID]);
  const existing = await sql`
    select id::text as id, title, status, archived_at is not null as archived
    from industrial_form_definitions
    where tenant_id = ${tenantId}::uuid
      and (
        (source_collection = ${SOURCE_COLLECTION} and source_document_id = ${SOURCE_DOCUMENT_ID})
        or title = ${TITLE}
      )
    order by archived_at nulls first, updated_at desc
    limit 1
  `;

  const result = {
    apply: APPLY,
    tenantKey: TENANT_KEY,
    title: TITLE,
    existing: existing[0] ?? null,
    wouldId: id,
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ...result, dryRun: true }, null, 2));
    process.exit(0);
  }

  if (existing[0]?.id) {
    await sql`
      update industrial_form_definitions set
        title = ${TITLE},
        status = 'ACTIVE',
        form_key = ${FORM_KEY},
        schema_json = ${sql.json(SCHEMA)},
        source_system = 'FORGE',
        source_collection = ${SOURCE_COLLECTION},
        source_document_id = ${SOURCE_DOCUMENT_ID},
        source_payload = ${sql.json({ seededFrom: "seed-nrcme-verification-form", title: TITLE })},
        archived_at = null,
        updated_at = now()
      where id = ${existing[0].id}::uuid and tenant_id = ${tenantId}::uuid
    `;
    console.log(JSON.stringify({ ...result, action: "updated", id: existing[0].id }, null, 2));
  } else {
    await sql`
      insert into industrial_form_definitions (
        id, tenant_id, title, status, form_key, version, schema_json,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${TITLE}, 'ACTIVE', ${FORM_KEY}, '1',
        ${sql.json(SCHEMA)},
        'FORGE', ${SOURCE_COLLECTION}, ${SOURCE_DOCUMENT_ID},
        ${sql.json({ seededFrom: "seed-nrcme-verification-form", title: TITLE })},
        now(), now()
      )
    `;
    console.log(JSON.stringify({ ...result, action: "inserted", id }, null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
