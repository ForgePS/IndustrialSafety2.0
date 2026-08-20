/**
 * Apply Legal Acknowledgments S1 DDL + seed on Aurora (admin secret).
 * Idempotent. Development-first — refuse production unless ALLOW_PRODUCTION=1.
 *
 * Env:
 *   DATABASE_SECRET_ARN (required)
 *   APPLY=1 to mutate (default dry-run)
 *   FORGE_ENV=development|production
 *   ALLOW_PRODUCTION=1 (required if FORGE_ENV=production)
 *   LEGAL_SQL_PATH optional path when SQL is mounted; else uses LEGAL_SQL env
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const FORGE_ENV = (process.env.FORGE_ENV || "development").trim();
const ALLOW_PRODUCTION =
  process.env.ALLOW_PRODUCTION === "1" || process.env.ALLOW_PRODUCTION === "true";

if (FORGE_ENV === "production" && !ALLOW_PRODUCTION) {
  throw new Error("Refusing production apply without ALLOW_PRODUCTION=1");
}
if (FORGE_ENV !== "development" && FORGE_ENV !== "production") {
  throw new Error(`Unsupported FORGE_ENV=${FORGE_ENV}`);
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

function hashContent(content) {
  return createHash("sha256").update(String(content).trim(), "utf8").digest("hex");
}

const DRAFT_BANNER =
  "<p><strong>DRAFT — Not final legal language.</strong> Placeholder for development acknowledgment testing.</p>";

const SEED_DOCS = [
  {
    documentKey: "forge-industrial-user-access",
    documentType: "USER_ACCESS_ACKNOWLEDGMENT",
    title: "Forge Industrial Safety User Access Acknowledgment",
    version: "USER-ACK-1.0",
    content: `${DRAFT_BANNER}
<p>By accessing Forge Industrial Safety, I acknowledge that this account is assigned to me and is intended only for authorized business use. I agree to protect my login credentials and not permit another individual to use my account.</p>
<p>I understand that activity performed through my account may be electronically recorded and retained, including logins, record creation or modification, approvals, acknowledgments, electronic signatures, and administrative actions.</p>
<p>I understand that Forge Industrial Safety is a software management and documentation platform and does not replace my employer's safety policies, required training, inspections, competent or qualified persons, professional judgment, or compliance responsibilities.</p>`,
  },
  {
    documentKey: "forge-global-terms",
    documentType: "TERMS_OF_USE",
    title: "Terms of Use",
    version: "TOU-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Terms of Use for Forge platform users.</p>`,
  },
  {
    documentKey: "forge-global-privacy",
    documentType: "PRIVACY_NOTICE",
    title: "Privacy Notice",
    version: "PRIV-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Privacy Notice describing how Forge processes account and usage data.</p>`,
  },
  {
    documentKey: "forge-global-acceptable-use",
    documentType: "ACCEPTABLE_USE_POLICY",
    title: "Acceptable Use Policy",
    version: "AUP-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Acceptable Use Policy for Forge platform access.</p>`,
  },
  {
    documentKey: "forge-accessibility",
    documentType: "ACCESSIBILITY_NOTICE",
    title: "Accessibility Notice",
    version: "A11Y-1.0",
    content: `${DRAFT_BANNER}<p>Forge strives to make Industrial Safety accessible. This notice is not an ADA, Section 508, or WCAG certification claim.</p>`,
  },
];

const TRAINING_ATTESTATION_TEXT =
  "I certify that the information associated with this training completion is accurate and complete to the best of my knowledge and that I am performing this action using my individually assigned Forge account.";

const FLAG_DEFS = [
  {
    key: "industrial.legalAcknowledgments.enabled",
    name: "Industrial legal acknowledgments",
    description: "Enable legal acknowledgment subsystem for Forge Industrial Safety.",
    defaultValue: true,
  },
  {
    key: "industrial.legalAcknowledgments.loginGate.enabled",
    name: "Industrial legal acknowledgment login gate",
    description: "Require outstanding legal acknowledgments before Industrial app access.",
    defaultValue: true,
  },
  {
    key: "industrial.legalAcknowledgments.transactionAttestations.enabled",
    name: "Industrial transaction attestations",
    description: "Enable transaction-specific electronic attestations.",
    defaultValue: true,
  },
  {
    key: "industrial.legalAcknowledgments.adminReporting.enabled",
    name: "Industrial legal acknowledgment admin reporting",
    description: "Enable admin compliance reporting and CSV export for acknowledgments.",
    defaultValue: true,
  },
  {
    key: "rms.legalAcknowledgments.enabled",
    name: "RMS legal acknowledgments",
    description: "Enable legal acknowledgments for Forge RMS. Default false.",
    defaultValue: false,
  },
  {
    key: "academy.legalAcknowledgments.enabled",
    name: "Academy legal acknowledgments",
    description: "Enable legal acknowledgments for Forge Academy. Default false.",
    defaultValue: false,
  },
];

function loadSql() {
  if (process.env.LEGAL_SQL_PATH) {
    return readFileSync(process.env.LEGAL_SQL_PATH, "utf8");
  }
  if (process.env.LEGAL_SQL) return process.env.LEGAL_SQL;
  throw new Error("LEGAL_SQL or LEGAL_SQL_PATH required");
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  if (!adminArn.includes(`forge-${FORGE_ENV}-`) || adminArn.includes("database-app")) {
    throw new Error(`Refusing non-admin or wrong-env secret ARN for ${FORGE_ENV}`);
  }

  const ddl = loadSql();
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  const report = {
    forgeEnv: FORGE_ENV,
    apply: APPLY,
    actions: [],
  };

  try {
    const before = await sql`
      select to_regclass('public.legal_documents')::text as legal_documents,
             to_regclass('public.user_legal_acknowledgments')::text as user_legal_acknowledgments,
             to_regclass('public.transaction_attestations')::text as transaction_attestations
    `;
    report.before = before[0] ?? before;

    if (!APPLY) {
      report.actions.push({ step: "ddl", action: "skipped_dry_run" });
    } else {
      await sql.unsafe(ddl);
      report.actions.push({ step: "ddl", action: "applied_0052" });
    }

    const after = await sql`
      select to_regclass('public.legal_documents')::text as legal_documents,
             to_regclass('public.user_legal_acknowledgments')::text as user_legal_acknowledgments,
             to_regclass('public.transaction_attestations')::text as transaction_attestations
    `;
    report.after = after[0] ?? after;

    if (APPLY && report.after?.legal_documents) {
      for (const def of FLAG_DEFS) {
        const [existing] = await sql`
          select id::text as id from feature_definitions where key = ${def.key} limit 1
        `;
        if (!existing) {
          await sql`
            insert into feature_definitions (
              id, key, name, description, value_type, default_value_json, status, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${def.key}, ${def.name}, ${def.description},
              'BOOLEAN', ${JSON.stringify(def.defaultValue)}::jsonb, 'ACTIVE', now(), now()
            )
          `;
          report.actions.push({ step: "feature_definition", key: def.key, action: "insert" });
        } else {
          report.actions.push({ step: "feature_definition", key: def.key, action: "unchanged" });
        }
      }

      for (const doc of SEED_DOCS) {
        let [row] = await sql`
          select id::text as id, current_version_id::text as current_version_id
          from legal_documents
          where document_key = ${doc.documentKey} and tenant_id is null
          limit 1
        `;
        let documentId = row?.id;
        if (!documentId) {
          documentId = randomUUID();
          await sql`
            insert into legal_documents (
              id, tenant_id, document_key, product_scope, document_type, title, description,
              status, current_version_id, created_at, updated_at
            ) values (
              ${documentId}::uuid, null, ${doc.documentKey}, 'FORGE_INDUSTRIAL', ${doc.documentType},
              ${doc.title}, 'Development seed document (DRAFT language).', 'ACTIVE', null, now(), now()
            )
          `;
          report.actions.push({ step: "legal_document", key: doc.documentKey, action: "insert" });
        } else {
          report.actions.push({ step: "legal_document", key: doc.documentKey, action: "unchanged" });
        }

        let [ver] = await sql`
          select id::text as id
          from legal_document_versions
          where legal_document_id = ${documentId}::uuid and version_number = 1
          limit 1
        `;
        let versionId = ver?.id;
        if (!versionId) {
          versionId = randomUUID();
          const contentHash = hashContent(doc.content);
          await sql`
            insert into legal_document_versions (
              id, legal_document_id, tenant_id, version, version_number, effective_at, published_at,
              content_format, content, content_hash, change_summary, material_change,
              requires_reacknowledgment, status, created_at
            ) values (
              ${versionId}::uuid, ${documentId}::uuid, null, ${doc.version}, 1, now(), now(),
              'HTML', ${doc.content}, ${contentHash}, 'Initial development seed version', true, true,
              'ACTIVE', now()
            )
          `;
          await sql`
            update legal_documents
            set current_version_id = ${versionId}::uuid, status = 'ACTIVE', updated_at = now()
            where id = ${documentId}::uuid
          `;
          report.actions.push({ step: "legal_document_version", key: doc.documentKey, action: "insert" });
        } else {
          report.actions.push({
            step: "legal_document_version",
            key: doc.documentKey,
            action: "unchanged",
          });
        }

        const [req] = await sql`
          select id::text as id
          from legal_acknowledgment_requirements
          where tenant_id is null and document_version_id = ${versionId}::uuid
          limit 1
        `;
        if (!req) {
          await sql`
            insert into legal_acknowledgment_requirements (
              id, tenant_id, product, document_id, document_version_id, required, required_from,
              reacknowledgment_policy, blocking_mode, created_at
            ) values (
              ${randomUUID()}::uuid, null, 'FORGE_INDUSTRIAL', ${documentId}::uuid, ${versionId}::uuid,
              true, now(), 'ON_MATERIAL_VERSION', 'BLOCKING', now()
            )
          `;
          report.actions.push({ step: "requirement", key: doc.documentKey, action: "insert" });
        } else {
          report.actions.push({ step: "requirement", key: doc.documentKey, action: "unchanged" });
        }
      }

      const templateKey = "TRAINING_COMPLETION";
      let [tmpl] = await sql`
        select id::text as id
        from attestation_templates
        where template_key = ${templateKey} and tenant_id is null
        limit 1
      `;
      let templateId = tmpl?.id;
      if (!templateId) {
        templateId = randomUUID();
        await sql`
          insert into attestation_templates (
            id, tenant_id, template_key, product, module, title, status, created_at, updated_at
          ) values (
            ${templateId}::uuid, null, ${templateKey}, 'FORGE_INDUSTRIAL', 'training',
            'Training completion certification', 'ACTIVE', now(), now()
          )
        `;
        report.actions.push({ step: "attestation_template", action: "insert" });
      } else {
        report.actions.push({ step: "attestation_template", action: "unchanged" });
      }

      const [tv] = await sql`
        select id::text as id
        from attestation_template_versions
        where template_id = ${templateId}::uuid and version_number = 1
        limit 1
      `;
      if (!tv) {
        const versionId = randomUUID();
        const contentHash = hashContent(TRAINING_ATTESTATION_TEXT);
        await sql`
          insert into attestation_template_versions (
            id, template_id, tenant_id, version, version_number, attestation_text, content_hash,
            status, published_at, created_at
          ) values (
            ${versionId}::uuid, ${templateId}::uuid, null, '1.0', 1, ${TRAINING_ATTESTATION_TEXT},
            ${contentHash}, 'ACTIVE', now(), now()
          )
        `;
        await sql`
          update attestation_templates
          set current_version_id = ${versionId}::uuid, updated_at = now()
          where id = ${templateId}::uuid
        `;
        report.actions.push({ step: "attestation_template_version", action: "insert" });
      } else {
        report.actions.push({ step: "attestation_template_version", action: "unchanged" });
      }

      const counts = await sql`
        select
          (select count(*)::int from legal_documents where tenant_id is null) as docs,
          (select count(*)::int from legal_document_versions where tenant_id is null) as versions,
          (select count(*)::int from legal_acknowledgment_requirements where tenant_id is null) as requirements,
          (select count(*)::int from attestation_templates where tenant_id is null) as templates
      `;
      report.counts = counts[0] ?? counts;
    } else if (!APPLY) {
      report.actions.push({ step: "seed", action: "skipped_dry_run" });
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
