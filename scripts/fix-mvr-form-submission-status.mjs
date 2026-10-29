/**
 * Reconcile PENDING_SIGNATURE MVR consent submissions when all deferred
 * signatures are already present (including Firebase metadata-only objects).
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-mvr-form-submission-status.mjs
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

const signatoryMod = await import(
  pathToFileURL("/app/apps/platform-api/dist/modules/industrial/form-signatory.js").href
);
const formPrintMod = await import(
  pathToFileURL("/app/apps/platform-api/dist/modules/industrial/form-print.js").href
);
const mvrMod = await import(
  pathToFileURL("/app/apps/platform-api/dist/modules/industrial/producers-mvr-policy.js").href
);

const { FORM_STATUS_PENDING_SIGNATURE, hasDeferredSignatoryFields, resolveFormSubmissionStatus } =
  signatoryMod;
const { extractFormDefinitionFields, resolveFormAnswers } = formPrintMod;
const { isProducersMvrConsentForm } = mvrMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
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

async function main() {
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
  const sql = postgres(await resolveDatabaseUrl(secretArn));

  const [tenant] = await sql`
    select id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const definitions = await sql`
    select id, title, schema_json, source_payload, source_document_id
    from industrial_form_definitions
    where tenant_id = ${tenant.id}
      and archived_at is null
  `;
  const mvrDefinitionIds = new Set();
  const definitionById = new Map();
  for (const row of definitions) {
    definitionById.set(row.id, row);
    if (
      isProducersMvrConsentForm({
        title: row.title,
        sourceDocumentId: row.source_document_id,
        sourcePayload: row.source_payload,
      })
    ) {
      mvrDefinitionIds.add(row.id);
    }
  }

  const pending = await sql`
    select id, title, status, form_definition_id, answers, source_payload, updated_at
    from industrial_form_submissions
    where tenant_id = ${tenant.id}
      and archived_at is null
      and upper(status) = ${FORM_STATUS_PENDING_SIGNATURE}
  `;

  const candidates = pending.filter(
    (row) => !mvrDefinitionIds.size || mvrDefinitionIds.has(row.form_definition_id),
  );

  const report = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    mvrDefinitionCount: mvrDefinitionIds.size,
    pendingTotal: pending.length,
    scanned: candidates.length,
    wouldUpdate: [],
    updated: [],
    skipped: [],
  };

  for (const row of candidates) {
    const definition = definitionById.get(row.form_definition_id);
    if (!definition) {
      report.skipped.push({ id: row.id, reason: "missing_definition" });
      continue;
    }
    const fields = extractFormDefinitionFields({
      schemaJson: definition.schema_json,
      sourcePayload: definition.source_payload,
      title: definition.title,
      sourceDocumentId: definition.source_document_id,
    });
    if (!hasDeferredSignatoryFields(fields)) {
      report.skipped.push({ id: row.id, reason: "no_deferred_fields" });
      continue;
    }
    const answers = resolveFormAnswers(row.answers, row.source_payload);
    const resolvedStatus = resolveFormSubmissionStatus(fields, answers, row.status);
    if (resolvedStatus === row.status) {
      report.skipped.push({ id: row.id, reason: "still_pending", title: row.title });
      continue;
    }
    const entry = {
      id: row.id,
      title: row.title,
      from: row.status,
      to: resolvedStatus,
    };
    report.wouldUpdate.push(entry);
    if (APPLY) {
      await sql`
        update industrial_form_submissions
        set status = ${resolvedStatus}, updated_at = now()
        where id = ${row.id} and tenant_id = ${tenant.id}
      `;
      report.updated.push(entry);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
