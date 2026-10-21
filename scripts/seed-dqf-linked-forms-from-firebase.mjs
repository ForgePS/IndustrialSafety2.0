/**
 * producers-rice-mill: attach Firebase DQF linked-form PDFs onto DOT driver
 * records, and stamp form submissions with Forge personnelId / dotRecordId.
 *
 * Sources:
 *   - Form freeze: FORMS_FREEZE_BUCKET/KEY (wave2-remaining payload)
 *   - Linked PDFs: s3://$S3_IMPORT_BUCKET/storage/source/.../dqf-linked-forms/
 *
 * Matching:
 *   - PDF path → firebaseDotId / fieldId / formSubId
 *   - Submission → CDL / personnelName / firebase personnelId
 *   - DOT driver → CDL then normalized name
 *   - Personnel → source_document_id (Firebase) then employee # / name
 *
 * Idempotent on forge_documents (tenant_id, object_key) and merges Copy fields
 * without wiping other DQF uploads. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-dqf-linked-forms-from-firebase.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-dqf-linked-forms-from-firebase.mjs
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const { S3Client, ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand } =
  apiRequire("@aws-sdk/client-s3");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

const IMPORTS_BUCKET =
  process.env.S3_IMPORT_BUCKET ||
  process.env.FORMS_FREEZE_BUCKET ||
  "forge-production-imports-511343547817-us-east-1";
const DOCUMENTS_BUCKET =
  process.env.S3_DOCUMENT_BUCKET || "forge-production-documents-511343547817-us-east-1";
const PAYLOAD_BUCKET = process.env.FORMS_FREEZE_BUCKET || IMPORTS_BUCKET;
const PAYLOAD_KEY =
  process.env.FORMS_FREEZE_KEY ||
  "seed/forms-from-freeze/source/wave2-remaining-payload.json";
const LINKED_FORMS_PREFIX =
  process.env.DQF_LINKED_FORMS_PREFIX ||
  "storage/source/module-attachments/business-1782553339499/dotCompliance/dqf-linked-forms/";

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

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function unwrap(raw) {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function normalizePersonKey(value) {
  const parts = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(jr|sr|ii|iii|iv|v)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
}

function normalizeEmployeeNumber(value) {
  let s = asText(value).toUpperCase();
  if (!s) return "";
  s = s.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

function normalizeCdl(value) {
  return asText(value).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

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

function parseLinkedFormKey(key) {
  // .../dqf-linked-forms/{firebaseDotId}/{fieldId}/{filename}
  const marker = "/dqf-linked-forms/";
  const idx = key.indexOf(marker);
  if (idx < 0) return null;
  const rest = key.slice(idx + marker.length);
  const [firebaseDotId, fieldId, filename] = rest.split("/");
  if (!firebaseDotId || !fieldId || !filename) return null;
  const subMatch = filename.match(/__form-sub_([A-Za-z0-9]+)_\.pdf$/i);
  return {
    key,
    firebaseDotId,
    fieldId,
    filename,
    formSubId: subMatch?.[1] ?? "",
    copyFieldId: fieldId.endsWith("Copy") ? fieldId : `${fieldId}Copy`,
  };
}

function parseFileValues(raw) {
  const text = asText(raw);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((row) => row && typeof row === "object");
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // ignore
  }
  return [];
}

function serializeFileValues(files) {
  return files.length ? JSON.stringify(files) : "";
}

function isDriverPayload(payload) {
  const cat = asText(payload.category).toLowerCase();
  return payload.dqf === true || cat.includes("driver") || cat.includes("dqf");
}

async function loadPayload(s3) {
  const { GetObjectCommand } = apiRequire("@aws-sdk/client-s3");
  const res = await s3.send(
    new GetObjectCommand({ Bucket: PAYLOAD_BUCKET, Key: PAYLOAD_KEY }),
  );
  const text = await res.Body.transformToString("utf8");
  return JSON.parse(text);
}

async function listLinkedFormObjects(s3) {
  const out = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: IMPORTS_BUCKET,
        Prefix: LINKED_FORMS_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key || !obj.Key.toLowerCase().endsWith(".pdf")) continue;
      const parsed = parseLinkedFormKey(obj.Key);
      if (!parsed) continue;
      out.push({ ...parsed, size: Number(obj.Size ?? 0) });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

const region = process.env.AWS_REGION || "us-east-1";
const s3 = new S3Client({ region });
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const payload = await loadPayload(s3);
  const freezeSubs = Array.isArray(payload.formSubmissions) ? payload.formSubmissions : [];
  const linkedObjects = await listLinkedFormObjects(s3);

  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant.id;

  const people = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      first_name,
      last_name,
      source_document_id
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  const personnelByFirebaseId = new Map();
  const personnelByEmployee = new Map();
  const personnelByName = new Map();
  for (const person of people) {
    if (person.source_document_id) {
      personnelByFirebaseId.set(String(person.source_document_id), person.id);
    }
    const emp = normalizeEmployeeNumber(person.employee_number);
    if (emp) personnelByEmployee.set(emp, person.id);
    for (const candidate of [
      person.display_name,
      `${person.first_name ?? ""} ${person.last_name ?? ""}`,
    ]) {
      const key = normalizePersonKey(candidate);
      if (key) personnelByName.set(key, person.id);
      const full = asText(candidate).toLowerCase();
      if (full) personnelByName.set(full, person.id);
    }
  }

  const dotRows = await sql`
    select
      id::text as id,
      title,
      personnel_id::text as personnel_id,
      source_document_id,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  const driversByCdl = new Map();
  const driversByName = new Map();
  const driversByFirebaseDotId = new Map();
  for (const row of dotRows) {
    const payloadRow = unwrap(row.source_payload);
    if (!isDriverPayload(payloadRow) && !/driver|dqf/i.test(`${row.title}`)) continue;
    const cdl = normalizeCdl(payloadRow.cdlNumber || payloadRow.licenseNumber);
    if (cdl) driversByCdl.set(cdl, row);
    for (const candidate of [
      payloadRow.driverName,
      payloadRow.workerName,
      payloadRow.displayName,
      payloadRow.personnelName,
      row.title,
    ]) {
      const key = normalizePersonKey(candidate);
      if (key) driversByName.set(key, row);
      const full = asText(candidate).toLowerCase();
      if (full) driversByName.set(full, row);
    }
    const firebaseDot =
      asText(payloadRow.firebaseDotRecordId) ||
      asText(payloadRow.firebaseSourceDocumentId) ||
      asText(row.source_document_id);
    if (firebaseDot && !firebaseDot.startsWith("cdl:")) {
      driversByFirebaseDotId.set(firebaseDot, row);
    }
  }

  const dbSubs = await sql`
    select
      id::text as id,
      title,
      status,
      form_definition_id::text as form_definition_id,
      answers,
      source_document_id,
      source_payload
    from industrial_form_submissions
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  const subByFirebaseId = new Map();
  for (const row of dbSubs) {
    if (row.source_document_id) subByFirebaseId.set(String(row.source_document_id), row);
  }
  for (const freeze of freezeSubs) {
    const firebaseId = asText(freeze.sourceDocumentId || freeze.id);
    if (!firebaseId || subByFirebaseId.has(firebaseId)) continue;
    // Freeze-only metadata used when DB row missing (should be rare after forms reseed).
    subByFirebaseId.set(firebaseId, {
      id: null,
      title: asText(freeze.data?.templateName || freeze.data?.title),
      status: asText(freeze.data?.status) || "SUBMITTED",
      form_definition_id: null,
      answers: freeze.data?.responses ?? {},
      source_document_id: firebaseId,
      source_payload: freeze.data ?? {},
      _fromFreezeOnly: true,
    });
  }

  const report = {
    tenantKey: TENANT_KEY,
    tenantId,
    apply: APPLY,
    linkedPdfCount: linkedObjects.length,
    freezeSubmissionCount: freezeSubs.length,
    dbSubmissionCount: dbSubs.length,
    documentsCreated: 0,
    documentsReused: 0,
    driversUpdated: 0,
    submissionsLinked: 0,
    unmatchedPdfs: 0,
    unmatchedSubs: 0,
    samples: [],
  };

  const driverUpdates = new Map(); // forgeDotId → payload patch accumulator
  const touchedDrivers = new Set();

  function resolvePersonnelId(submissionData, answers) {
    const firebasePersonnelId = asText(
      submissionData.personnelId || answers.personnelId || answers.employeeId,
    );
    if (firebasePersonnelId && personnelByFirebaseId.has(firebasePersonnelId)) {
      return personnelByFirebaseId.get(firebasePersonnelId);
    }
    const emp = normalizeEmployeeNumber(
      answers.employeeNumber || answers.employee_number || submissionData.employeeNumber,
    );
    if (emp && personnelByEmployee.has(emp)) return personnelByEmployee.get(emp);
    const name = asText(
      submissionData.personnelName ||
        answers["employee-name-printed"] ||
        answers.employeeName ||
        answers.fullName,
    );
    const key = normalizePersonKey(name);
    if (key && personnelByName.has(key)) return personnelByName.get(key);
    const full = name.toLowerCase();
    if (full && personnelByName.has(full)) return personnelByName.get(full);
    return null;
  }

  function resolveDriver(submissionData, answers, firebaseDotId) {
    if (firebaseDotId && driversByFirebaseDotId.has(firebaseDotId)) {
      return driversByFirebaseDotId.get(firebaseDotId);
    }
    const cdl = normalizeCdl(
      answers["drivers-license-number"] ||
        answers.cdlNumber ||
        answers.licenseNumber ||
        submissionData.cdlNumber,
    );
    if (cdl && driversByCdl.has(cdl)) return driversByCdl.get(cdl);
    const name = asText(
      submissionData.personnelName ||
        submissionData.dotRecordLabel ||
        answers["employee-name-printed"] ||
        answers.employeeName,
    );
    const key = normalizePersonKey(name);
    if (key && driversByName.has(key)) return driversByName.get(key);
    const full = name.toLowerCase();
    if (full && driversByName.has(full)) return driversByName.get(full);
    return null;
  }

  function queueDriverFile(driver, copyFieldId, fileMeta, firebaseDotId) {
    const current = driverUpdates.get(driver.id) ?? {
      payload: unwrap(driver.source_payload),
      filesByField: new Map(),
    };
    if (!current.filesByField.has(copyFieldId)) {
      const existing = parseFileValues(
        current.payload[copyFieldId] ?? current.payload.details?.[copyFieldId],
      );
      current.filesByField.set(copyFieldId, existing);
    }
    const list = current.filesByField.get(copyFieldId);
    if (!list.some((row) => asText(row.documentId) === fileMeta.documentId)) {
      list.push(fileMeta);
    }
    current.payload.firebaseDotRecordId =
      asText(current.payload.firebaseDotRecordId) || firebaseDotId;
    driverUpdates.set(driver.id, current);
    touchedDrivers.add(driver.id);
  }

  for (const pdf of linkedObjects) {
    const sub = pdf.formSubId ? subByFirebaseId.get(pdf.formSubId) : null;
    const submissionData = unwrap(sub?.source_payload);
    const answers = unwrap(sub?.answers || submissionData.responses || submissionData.answers);
    const driver = resolveDriver(submissionData, answers, pdf.firebaseDotId);
    if (!driver) {
      report.unmatchedPdfs += 1;
      if (report.samples.length < 12) {
        report.samples.push({
          kind: "unmatchedPdf",
          firebaseDotId: pdf.firebaseDotId,
          fieldId: pdf.fieldId,
          formSubId: pdf.formSubId,
          filename: pdf.filename,
        });
      }
      continue;
    }

    const objectKey = `tenants/${tenantId}/dot/dqf/${pdf.copyFieldId}/firebase-${pdf.formSubId || pdf.filename}`;
    const documentId = deterministicUuid([
      "dqf-linked-form",
      tenantId,
      pdf.firebaseDotId,
      pdf.copyFieldId,
      pdf.formSubId || pdf.filename,
    ]);

    let reused = false;
    if (APPLY) {
      const existingDoc = await sql`
        select id::text as id from forge_documents
        where tenant_id = ${tenantId}::uuid and object_key = ${objectKey}
        limit 1
      `;
      if (existingDoc[0]?.id) {
        reused = true;
        report.documentsReused += 1;
        queueDriverFile(
          driver,
          pdf.copyFieldId,
          {
            name: pdf.filename,
            documentId: existingDoc[0].id,
            contentType: "application/pdf",
            fileSizeBytes: pdf.size || undefined,
            uploadedAt: new Date().toISOString(),
          },
          pdf.firebaseDotId,
        );
      } else {
        try {
          await s3.send(
            new HeadObjectCommand({
              Bucket: DOCUMENTS_BUCKET,
              Key: objectKey,
            }),
          );
        } catch {
          await s3.send(
            new CopyObjectCommand({
              Bucket: DOCUMENTS_BUCKET,
              Key: objectKey,
              CopySource: encodeURIComponent(`${IMPORTS_BUCKET}/${pdf.key}`).replace(/%2F/g, "/"),
              ContentType: "application/pdf",
              MetadataDirective: "REPLACE",
            }),
          );
        }

        await sql`
          insert into forge_documents (
            id, tenant_id, original_filename, stored_filename, object_key, bucket_name,
            mime_type, file_size_bytes, security_classification, malware_scan_status,
            retention_rule, upload_status, source, uploaded_by_user_id, uploaded_at,
            created_at, updated_at
          ) values (
            ${documentId}::uuid, ${tenantId}::uuid, ${pdf.filename}, ${pdf.filename},
            ${objectKey}, ${DOCUMENTS_BUCKET}, 'application/pdf', ${pdf.size || 0},
            'INTERNAL', 'PENDING', 'DOT_DQF_DEFAULT', 'COMPLETE', 'INDUSTRIAL_DOT_DQF',
            null, now(), now(), now()
          )
          on conflict (tenant_id, object_key) do nothing
        `;
        const [created] = await sql`
          select id::text as id from forge_documents
          where tenant_id = ${tenantId}::uuid and object_key = ${objectKey}
          limit 1
        `;
        report.documentsCreated += 1;
        queueDriverFile(
          driver,
          pdf.copyFieldId,
          {
            name: pdf.filename,
            documentId: created?.id || documentId,
            contentType: "application/pdf",
            fileSizeBytes: pdf.size || undefined,
            uploadedAt: new Date().toISOString(),
          },
          pdf.firebaseDotId,
        );
      }
    } else {
      report.documentsCreated += 1;
      queueDriverFile(
        driver,
        pdf.copyFieldId,
        {
          name: pdf.filename,
          documentId,
          contentType: "application/pdf",
          fileSizeBytes: pdf.size || undefined,
          uploadedAt: new Date().toISOString(),
        },
        pdf.firebaseDotId,
      );
    }

    if (report.samples.length < 12) {
      report.samples.push({
        kind: reused ? "pdfReuse" : "pdfAttach",
        driverId: driver.id,
        driverTitle: driver.title,
        fieldId: pdf.fieldId,
        formSubId: pdf.formSubId,
        filename: pdf.filename,
      });
    }
  }

  // Stamp Forge IDs onto form submissions for personnel/DOT profile linking.
  for (const [firebaseSubId, sub] of subByFirebaseId.entries()) {
    if (sub._fromFreezeOnly || !sub.id) {
      report.unmatchedSubs += 1;
      continue;
    }
    const submissionData = unwrap(sub.source_payload);
    const answers = unwrap(sub.answers || submissionData.responses || submissionData.answers);
    const firebaseDotId = asText(submissionData.dotRecordId);
    const driver = resolveDriver(submissionData, answers, firebaseDotId);
    const personnelId =
      resolvePersonnelId(submissionData, answers) ||
      (driver?.personnel_id && /^[0-9a-f-]{36}$/i.test(driver.personnel_id)
        ? driver.personnel_id
        : null);

    if (!driver && !personnelId) {
      report.unmatchedSubs += 1;
      continue;
    }

    const nextPayload = {
      ...submissionData,
      firebasePersonnelId:
        asText(submissionData.personnelId) || asText(submissionData.firebasePersonnelId) || null,
      firebaseDotRecordId:
        asText(submissionData.dotRecordId) || asText(submissionData.firebaseDotRecordId) || null,
      ...(personnelId ? { personnelId } : {}),
      ...(driver ? { forgeDotRecordId: driver.id, dotRecordId: driver.id } : {}),
    };

    if (APPLY) {
      await sql`
        update industrial_form_submissions set
          source_payload = ${sql.json(nextPayload)},
          updated_at = now()
        where id = ${sub.id}::uuid and tenant_id = ${tenantId}::uuid
      `;
    }
    report.submissionsLinked += 1;
  }

  for (const [driverId, update] of driverUpdates.entries()) {
    const payload = { ...update.payload };
    const details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? { ...payload.details }
        : {};
    for (const [copyFieldId, files] of update.filesByField.entries()) {
      const serialized = serializeFileValues(files);
      payload[copyFieldId] = serialized;
      details[copyFieldId] = serialized;
      const dateFieldId = copyFieldId.endsWith("Copy") ? copyFieldId.slice(0, -4) : "";
      if (dateFieldId && !asText(payload[dateFieldId]) && !asText(details[dateFieldId])) {
        const stamp = asText(files[0]?.uploadedAt).slice(0, 10);
        if (stamp) {
          payload[dateFieldId] = stamp;
          details[dateFieldId] = stamp;
        }
      }
    }
    payload.details = details;

    if (APPLY) {
      await sql`
        update industrial_dot_compliance_records set
          source_payload = ${sql.json(payload)},
          updated_at = now()
        where id = ${driverId}::uuid and tenant_id = ${tenantId}::uuid
      `;
    }
    report.driversUpdated += 1;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
