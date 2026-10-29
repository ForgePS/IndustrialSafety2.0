/**
 * READ-ONLY: compare producers-rice-mill form definitions to DQF worksheet link titles.
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

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXPECTED = {
  drugAlcoholClearinghouseConsent: "FMCSA Clearinghouse Query Consent",
  mvrReleaseForm: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
  drugAlcoholRecordkeepingLog: "DOT Drug & Alcohol Test Record Log",
  consentDrugAlcoholTest: "Consent for Drug and/or Alcohol Testing",
  previousEmployerSafetyPerformance: "Safety Performance History Records Request",
  safetyPerformanceHistoryRequest: "Safety Performance History Records Request",
  certificationOfRoadTest: "Driver Evaluation Road Test Form",
  observedBehaviorReasonableSuspicion: "Observed Behavior Reasonable Suspicion Record",
  cdlSelfCertificationAffidavitMs: "CDL Medical Self-Certification Affidavit (Mississippi)",
  cdlSelfCertificationAffidavitAr: "CDL Self-Certification Affidavit (Arkansas)",
  certificationComplianceDriverLicense: "Annual DQF Form",
  drugAlcoholTestConsentForm: "DOT Drug & Alcohol Consent for Testing",
  medicalExaminerNationalRegistryVerification:
    "Medical Examiner's National Registry Verification Form",
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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const tenantRows = await sql`
    select id::text as id from tenants where tenant_key = 'producers-rice-mill' limit 1
  `;
  const tenant = tenantRows[0]?.id;
  if (!tenant) throw new Error("tenant not found");

  const defs = await sql`
    select
      id::text as id,
      title,
      status,
      archived_at is not null as archived,
      source_document_id,
      coalesce(jsonb_array_length(schema_json->'fields'), 0)::int as field_count
    from industrial_form_definitions
    where tenant_id = ${tenant}::uuid
    order by title, updated_at desc
  `;

  const links = {};
  for (const [fieldId, title] of Object.entries(EXPECTED)) {
    const target = normalize(title);
    const exact = defs.filter((row) => !row.archived && normalize(row.title) === target);
    const fuzzy = defs.filter((row) => {
      if (row.archived) return false;
      const n = normalize(row.title);
      return n.includes(target) || target.includes(n);
    });
    links[fieldId] = {
      expectedTitle: title,
      exactMatches: exact.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        fieldCount: row.field_count,
        sourceDocumentId: row.source_document_id,
      })),
      fuzzyMatches: exact.length
        ? []
        : fuzzy.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            fieldCount: row.field_count,
            sourceDocumentId: row.source_document_id,
          })),
      linked: exact.length > 0 || fuzzy.length > 0,
    };
  }

  const recordkeeping = defs
    .filter((row) => !row.archived)
    .filter((row) =>
      /dqf|drug|alcohol|mvr|cdl|clearing|road|safety performance|suspicion|consent|driver evaluation|affidavit/i.test(
        row.title || "",
      ),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      fieldCount: row.field_count,
      sourceDocumentId: row.source_document_id,
    }));

  console.log(
    JSON.stringify(
      {
        tenant,
        definitionCount: defs.length,
        activeCount: defs.filter((row) => !row.archived).length,
        linkedFieldCount: Object.values(links).filter((row) => row.linked).length,
        expectedFieldCount: Object.keys(EXPECTED).length,
        links,
        recordkeeping,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
