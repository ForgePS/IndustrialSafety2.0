/**
 * Link Producers logo document + publish Configuration Studio tenant_profile
 * and branding for producers-rice-mill production tenant.
 *
 * Dry-run by default. APPLY=1 writes.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const TENANT_ID = (process.env.TENANT_ID || "019ff7d0-c20f-7659-81e4-c0cd68e23262").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

const DOCUMENTS_BUCKET =
  process.env.S3_DOCUMENT_BUCKET || "forge-production-documents-511343547817-us-east-1";
const LOGO_OBJECT_KEY = `tenants/${TENANT_ID}/branding/logo/019ff7df-2c16-740a-8414-674df510762f-Producers_Logo.png`;
const LOGO_DOCUMENT_ID = "019ff7df-2c16-740a-8414-674df510762f";
const LOGO_PUBLIC_URL = "https://producersrice.forgepublicsafety.com/branding/producers-rice-mill.png";
const LOGO_FILE_SIZE = 1_106_901;

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

const TENANT_PROFILE = {
  displayName: "Producers Rice Mill",
  legalName: "Producers Rice Mill, Inc.",
  timezone: "America/Chicago",
  locale: "en-US",
  contactEmail: "info@producersrice.com",
  notes: "Headquarters: 518 East Harrison Street, Stuttgart, AR 72160",
};

const BRANDING = {
  productDisplayName: "Producers Rice Mill",
  appShortName: "Producers Rice",
  primaryColor: "#1a365d",
  secondaryColor: "#2d3748",
  accentColor: "#3182ce",
  approvedColors: ["#1a365d", "#2d3748", "#3182ce"],
  logoUrl: LOGO_PUBLIC_URL,
  contactName: "Producers Rice Mill",
  contactPhone: "870-673-4444",
  supportEmail: "info@producersrice.com",
  reportIdentity: "Producers Rice Mill Reports",
  documentFooter: "Producers Rice Mill, Inc.",
  emailFromName: "Producers Rice Mill",
  login: {
    logoUrl: LOGO_PUBLIC_URL,
    brandLabel: "Producers Rice Mill",
    headline: "Welcome to Producers Rice Mill",
    body: "Sign in is required to continue.",
    statusText: "",
    buttonLabel: "Sign in",
  },
};

function hashPayload(payload) {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
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

async function publishConfig(sql, tenantId, namespace, objectKey, displayName, payload) {
  const contentHash = hashPayload(payload);
  const payloadJson = JSON.stringify(payload);

  const existingObject = await sql`
    select id::text as id, current_published_version_id::text as published_id
    from config_objects
    where tenant_id = ${tenantId}::uuid
      and namespace = ${namespace}
      and object_key = ${objectKey}
    limit 1
  `;

  let objectId = existingObject[0]?.id;
  if (!objectId) {
    objectId = randomUUID();
    await sql`
      insert into config_objects (
        id, tenant_id, namespace, object_key, display_name,
        record_version, created_at, updated_at
      ) values (
        ${objectId}::uuid,
        ${tenantId}::uuid,
        ${namespace},
        ${objectKey},
        ${displayName},
        1,
        now(),
        now()
      )
    `;
  }

  const currentPublished = await sql`
    select id::text as id, content_hash
    from config_versions
    where object_id = ${objectId}::uuid
      and state = 'PUBLISHED'
    limit 1
  `;
  if (currentPublished[0]?.content_hash === contentHash) {
    return { objectId, versionId: currentPublished[0].id, skipped: true, reason: "unchanged" };
  }

  if (currentPublished[0]) {
    await sql`
      update config_versions
      set state = 'SUPERSEDED',
          effective_to = now(),
          updated_at = now()
      where id = ${currentPublished[0].id}::uuid
    `;
  }

  const latest = await sql`
    select coalesce(max(version), 0)::int as v
    from config_versions
    where object_id = ${objectId}::uuid
  `;
  const nextVersion = (latest[0]?.v ?? 0) + 1;
  const versionId = randomUUID();

  await sql`
    insert into config_versions (
      id, tenant_id, object_id, version, state, payload_json, content_hash,
      change_summary, effective_from, published_at, supersedes_version_id,
      record_version, created_at, updated_at
    ) values (
      ${versionId}::uuid,
      ${tenantId}::uuid,
      ${objectId}::uuid,
      ${nextVersion},
      'PUBLISHED',
      ${payloadJson}::jsonb,
      ${contentHash},
      ${"Seeded Producers Rice Mill " + namespace},
      now(),
      now(),
      ${currentPublished[0]?.id ?? null}::uuid,
      1,
      now(),
      now()
    )
  `;

  await sql`
    update config_objects
    set current_published_version_id = ${versionId}::uuid,
        updated_at = now(),
        record_version = record_version + 1
    where id = ${objectId}::uuid
  `;

  return { objectId, versionId, skipped: false, version: nextVersion };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const summary = {
    tenantKey: TENANT_KEY,
    tenantId: TENANT_ID,
    apply: APPLY,
    logoDocument: { exists: false, created: false, linked: false },
    tenantProfile: null,
    brandingConfig: null,
  };

  try {
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0] || tenant[0].id !== TENANT_ID) {
      throw new Error(`tenant mismatch for ${TENANT_KEY}`);
    }
    const tenantId = tenant[0].id;

    const doc = await sql`
      select id::text as id, upload_status, object_key
      from forge_documents
      where tenant_id = ${tenantId}::uuid
        and object_key = ${LOGO_OBJECT_KEY}
      limit 1
    `;
    summary.logoDocument.exists = Boolean(doc[0]);

    const branding = await sql`
      select id::text as id, logo_document_id::text as logo_document_id
      from tenant_branding
      where tenant_id = ${tenantId}::uuid
      limit 1
    `;

    const profileState = await sql`
      select o.object_key, v.state, v.content_hash
      from config_objects o
      left join config_versions v on v.id = o.current_published_version_id
      where o.tenant_id = ${tenantId}::uuid
        and o.namespace = 'tenant_profile'
        and o.object_key = 'default'
      limit 1
    `;
    const brandingState = await sql`
      select o.object_key, v.state, v.content_hash
      from config_objects o
      left join config_versions v on v.id = o.current_published_version_id
      where o.tenant_id = ${tenantId}::uuid
        and o.namespace = 'branding'
        and o.object_key = 'default'
      limit 1
    `;

    summary.tenantProfile = {
      published: profileState[0]?.state === "PUBLISHED",
      contentHash: profileState[0]?.content_hash ?? null,
      targetHash: hashPayload(TENANT_PROFILE),
    };
    summary.brandingConfig = {
      published: brandingState[0]?.state === "PUBLISHED",
      contentHash: brandingState[0]?.content_hash ?? null,
      targetHash: hashPayload(BRANDING),
      logoLinked: Boolean(branding[0]?.logo_document_id),
    };

    if (!APPLY) {
      console.log(JSON.stringify({ status: "dry-run", ...summary }, null, 2));
      return;
    }

    if (!doc[0]) {
      await sql`
        insert into forge_documents (
          id, tenant_id, original_filename, stored_filename, object_key, bucket_name,
          mime_type, file_size_bytes, security_classification, malware_scan_status,
          retention_rule, upload_status, source, uploaded_at, record_version, created_at, updated_at
        ) values (
          ${LOGO_DOCUMENT_ID}::uuid,
          ${tenantId}::uuid,
          ${"Producers_Logo.png"},
          ${"019ff7df-2c16-740a-8414-674df510762f-Producers_Logo.png"},
          ${LOGO_OBJECT_KEY},
          ${DOCUMENTS_BUCKET},
          ${"image/png"},
          ${LOGO_FILE_SIZE},
          ${"INTERNAL"},
          ${"CLEAN"},
          ${"BRANDING_DEFAULT"},
          ${"COMPLETED"},
          ${"BRANDING"},
          now(),
          1,
          now(),
          now()
        )
      `;
      summary.logoDocument.created = true;
    }

    if (branding[0]) {
      await sql`
        update tenant_branding
        set logo_document_id = ${LOGO_DOCUMENT_ID}::uuid,
            updated_at = now(),
            record_version = record_version + 1
        where id = ${branding[0].id}::uuid
      `;
      summary.logoDocument.linked = true;
    }

    summary.tenantProfile = await publishConfig(
      sql,
      tenantId,
      "tenant_profile",
      "default",
      "Tenant Profile",
      TENANT_PROFILE,
    );
    summary.brandingConfig = await publishConfig(
      sql,
      tenantId,
      "branding",
      "default",
      "Branding",
      BRANDING,
    );

    console.log(JSON.stringify({ status: "ok", ...summary }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
