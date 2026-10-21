#!/usr/bin/env node
/**
 * UAT seed for Employee Training Portal directive scenario:
 * John Smith (#10452), Maintenance, Annual LOTO @ 80%, company portal access link.
 *
 * Prerequisites: migration 0063 applied; demo LOTO source (run seed-industrial-training-demo.mjs first).
 *
 * Env:
 *   DATABASE_SECRET_ARN or DATABASE_URL
 *   FORGE_TRAINING_SEED_TENANT_ID (required)
 *   FORGE_TRAINING_UAT_APP_BASE_URL (optional, default http://localhost:3004)
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { defaultLocalDatabaseUrl, loadPostgres, repoRequireFrom } from "./seed-db-client.mjs";

const EMPLOYEE_NUMBER = "10452";
const EMPLOYEE_NAME = "John Smith";
const DEPARTMENT_NAME = "Maintenance";
const LOTO_SOURCE_TITLE = "Lockout/Tagout Essentials";
const ASSIGNMENT_TITLE = "Annual Lockout/Tagout Training";

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function issueToken() {
  return randomBytes(32).toString("base64url");
}

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN or DATABASE_URL required");
  const apiRequire = repoRequireFrom("apps/platform-api/package.json");
  const { SecretsManagerClient, GetSecretValueCommand } = apiRequire("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function resolvePostgres() {
  return loadPostgres();
}

async function main() {
  const tenantId = process.env.FORGE_TRAINING_SEED_TENANT_ID?.trim();
  if (!tenantId) throw new Error("FORGE_TRAINING_SEED_TENANT_ID required");
  const appBaseUrl = (process.env.FORGE_TRAINING_UAT_APP_BASE_URL || "http://localhost:3004").replace(/\/$/, "");

  const postgres = await resolvePostgres();
  const sql = postgres(process.env.DATABASE_URL?.trim() || defaultLocalDatabaseUrl(), { max: 1 });
  const now = new Date().toISOString();

  try {
    await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;

    const [source] = await sql`
      select id::text as id from industrial_training_sources
      where tenant_id = ${tenantId}::uuid and title = ${LOTO_SOURCE_TITLE} and archived_at is null
      limit 1
    `;
    if (!source?.id) {
      throw new Error(
        `Published source "${LOTO_SOURCE_TITLE}" not found. Run scripts/seed-industrial-training-demo.mjs first.`,
      );
    }

    let [department] = await sql`
      select id::text as id from industrial_departments
      where tenant_id = ${tenantId}::uuid and lower(name) = lower(${DEPARTMENT_NAME}) and archived_at is null
      limit 1
    `;
    if (!department?.id) {
      const departmentId = randomUUID();
      await sql`
        insert into industrial_departments (id, tenant_id, name, status, created_at, updated_at)
        values (${departmentId}::uuid, ${tenantId}::uuid, ${DEPARTMENT_NAME}, 'ACTIVE', ${now}::timestamptz, ${now}::timestamptz)
      `;
      department = { id: departmentId };
    }

    let [person] = await sql`
      select id::text as id from industrial_personnel
      where tenant_id = ${tenantId}::uuid
        and lower(trim(employee_number)) = lower(${EMPLOYEE_NUMBER})
        and archived_at is null
      limit 1
    `;
    if (!person?.id) {
      const personId = randomUUID();
      await sql`
        insert into industrial_personnel (
          id, tenant_id, department_id, employee_number, display_name, first_name, last_name,
          department_name, job_title, status, created_at, updated_at
        ) values (
          ${personId}::uuid, ${tenantId}::uuid, ${department.id}::uuid, ${EMPLOYEE_NUMBER},
          ${EMPLOYEE_NAME}, 'John', 'Smith', ${DEPARTMENT_NAME}, 'Maintenance Technician',
          'ACTIVE', ${now}::timestamptz, ${now}::timestamptz
        )
      `;
      person = { id: personId };
    }

    let [version] = await sql`
      select id::text as id from industrial_training_course_versions
      where tenant_id = ${tenantId}::uuid and source_id = ${source.id}::uuid and version_number = 1
      limit 1
    `;
    if (!version?.id) {
      const versionId = randomUUID();
      await sql`
        insert into industrial_training_course_versions (
          id, tenant_id, source_id, version_number, version_label, passing_percent,
          status, published_at, created_at, updated_at
        ) values (
          ${versionId}::uuid, ${tenantId}::uuid, ${source.id}::uuid, 1, 'Version 1', 80,
          'PUBLISHED', ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz
        )
      `;
      version = { id: versionId };
    }

    const sectionCount = await sql`
      select count(*)::int as c from industrial_training_course_sections
      where tenant_id = ${tenantId}::uuid and version_id = ${version.id}::uuid and archived_at is null
    `;
    if ((sectionCount[0]?.c ?? 0) === 0) {
      const sections = [
        {
          title: "Energy Control Basics",
          body: "Review lockout/tagout purpose, authorized employees, and isolation verification before starting the quiz.",
        },
        {
          title: "Verification",
          body: "Confirm zero-energy state using established methods before beginning work on isolated equipment.",
        },
      ];
      for (const [index, section] of sections.entries()) {
        await sql`
          insert into industrial_training_course_sections (
            id, tenant_id, version_id, title, sort_order, required, content_json, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, ${version.id}::uuid, ${section.title},
            ${index}, true, ${sql.json([{ type: "text", text: section.body }])},
            ${now}::timestamptz, ${now}::timestamptz
          )
        `;
      }
    }

    let [assignment] = await sql`
      select id::text as id from industrial_training_assignments
      where tenant_id = ${tenantId}::uuid and title = ${ASSIGNMENT_TITLE} and archived_at is null
      limit 1
    `;
    if (!assignment?.id) {
      const assignmentId = randomUUID();
      await sql`
        insert into industrial_training_assignments (
          id, tenant_id, title, description, source_id, course_version_id, passing_percent,
          quiz_mode, option_count, feedback_enabled, status, created_at, updated_at
        ) values (
          ${assignmentId}::uuid, ${tenantId}::uuid, ${ASSIGNMENT_TITLE},
          'Directive UAT — annual LOTO refresher for maintenance staff.',
          ${source.id}::uuid, ${version.id}::uuid, 80, 'STANDARD', 4, true, 'ACTIVE',
          ${now}::timestamptz, ${now}::timestamptz
        )
      `;
      assignment = { id: assignmentId };
    } else {
      await sql`
        update industrial_training_assignments
        set course_version_id = ${version.id}::uuid, passing_percent = 80, updated_at = ${now}::timestamptz
        where id = ${assignment.id}::uuid
      `;
    }

    const [assignee] = await sql`
      select id::text as id from industrial_training_assignment_assignees
      where tenant_id = ${tenantId}::uuid and assignment_id = ${assignment.id}::uuid
        and lower(trim(employee_number)) = lower(${EMPLOYEE_NUMBER})
      limit 1
    `;
    if (!assignee?.id) {
      await sql`
        insert into industrial_training_assignment_assignees (
          id, tenant_id, assignment_id, personnel_id, employee_number, status, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${assignment.id}::uuid, ${person.id}::uuid,
          ${EMPLOYEE_NUMBER}, 'NOT_STARTED', ${now}::timestamptz, ${now}::timestamptz
        )
      `;
    }

    let [accessLink] = await sql`
      select id::text as id, public_token_hash from industrial_training_access_links
      where tenant_id = ${tenantId}::uuid and title = 'Company training portal (UAT)' and archived_at is null
      limit 1
    `;
    let portalToken = null;
    const reissueToken =
      process.env.FORGE_TRAINING_UAT_REISSUE_TOKEN === "1" ||
      String(process.env.DATABASE_URL ?? defaultLocalDatabaseUrl()).includes("localhost");
    if (!accessLink?.id) {
      const linkId = randomUUID();
      portalToken = issueToken();
      const tokenHash = hashToken(portalToken);
      await sql`
        insert into industrial_training_access_links (
          id, tenant_id, link_type, title, status, public_token_hash, public_token_issued_at,
          assigned_only, created_at, updated_at
        ) values (
          ${linkId}::uuid, ${tenantId}::uuid, 'COMPANY_PORTAL', 'Company training portal (UAT)',
          'ACTIVE', ${tokenHash}, ${now}::timestamptz, true, ${now}::timestamptz, ${now}::timestamptz
        )
      `;
      accessLink = { id: linkId, public_token_hash: tokenHash };
    } else if (!accessLink.public_token_hash || reissueToken) {
      portalToken = issueToken();
      const tokenHash = hashToken(portalToken);
      await sql`
        update industrial_training_access_links
        set public_token_hash = ${tokenHash}, public_token_issued_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
        where id = ${accessLink.id}::uuid
      `;
    }

    const portalUrl =
      portalToken != null
        ? `${appBaseUrl}/training/access/${portalToken}`
        : "(existing token — re-issue QR from admin Training → QR / Access)";

    const viewUrl =
      portalToken != null
        ? `${appBaseUrl}/training/portal?token=${encodeURIComponent(portalToken)}`
        : null;

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId,
          employee: { name: EMPLOYEE_NAME, employeeNumber: EMPLOYEE_NUMBER, personnelId: person.id },
          department: DEPARTMENT_NAME,
          assignmentId: assignment.id,
          sourceId: source.id,
          versionId: version.id,
          accessLinkId: accessLink.id,
          portalUrl,
          ...(viewUrl ? { viewUrl } : {}),
          uatSteps: [
            ...(viewUrl ? [`Open ${viewUrl}`] : [`Open ${portalUrl}`]),
            `Enter employee number ${EMPLOYEE_NUMBER}`,
            "Open Annual Lockout/Tagout Training",
            "Complete course sections",
            "Fail quiz attempt #1, then pass attempt #2",
            "Verify personnel training history and QC dashboard",
          ],
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
