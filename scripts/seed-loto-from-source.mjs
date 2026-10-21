/**
 * Backfill LOTO child tables (energy sources, isolation points, steps) and
 * link procedures to industrial_sites for producers-rice-mill from each
 * procedure's Firebase source_payload.
 *
 * Parent rows were imported earlier with opaque source_payload; detail UI
 * joins children, so procedures look empty until this runs.
 *
 * Idempotent: skips procedures that already have non-archived child rows
 * unless FORCE=1 (archives existing children first, then re-seeds).
 *
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-loto-from-source.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-loto-from-source.mjs
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const LIMIT = Number(process.env.LIMIT || "0");
const ALLOWED = new Set(["producers-rice-mill"]);
const SOURCE_SYSTEM = "FIREBASE_LOTO_CHILD_BACKFILL";

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

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function unwrapPayload(raw) {
  let current = raw;
  for (let depth = 0; depth < 4; depth += 1) {
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
    const obj = asRecord(current);
    if (obj) return obj;
    return {};
  }
  return {};
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Normalize Firebase / forge step shapes into createLoto field set. */
function normalizeStep(raw, index) {
  const row = asRecord(raw) ?? {};
  const nested = asRecord(row.energySource) ?? asRecord(row.energy) ?? {};
  const isolation = asRecord(row.isolationPoint) ?? asRecord(row.isolation) ?? {};
  const verification = asRecord(row.verification) ?? asRecord(row.verificationMethod) ?? {};

  const printed = asText(row.printedProcedureDescription) || asText(row.printedDescription);
  const descriptionCode = asText(row.descriptionCode) || asText(row.code);
  const customDescription = asText(row.customDescription) || asText(row.customText);

  const energySourceName =
    asText(row.energySourceName) ||
    asText(row.energyType) ||
    asText(row.energySource) ||
    asText(nested.name) ||
    asText(nested.energySourceName) ||
    asText(nested.type) ||
    descriptionCode ||
    "";
  const energyMagnitude =
    asText(row.energyMagnitude) ||
    asText(row.magnitude) ||
    asText(nested.magnitude) ||
    asText(nested.energyMagnitude) ||
    (descriptionCode && descriptionCode !== energySourceName ? descriptionCode : "") ||
    "";
  const energyNotes =
    asText(row.energyNotes) ||
    asText(row.description) ||
    asText(nested.description) ||
    asText(nested.notes) ||
    customDescription ||
    "";
  const isolationLocationText =
    asText(row.isolationLocationText) ||
    asText(row.locationDescription) ||
    asText(row.location) ||
    asText(isolation.locationText) ||
    asText(isolation.locationDescription) ||
    customDescription ||
    "";
  const isolationAction =
    asText(row.isolationAction) ||
    asText(row.isolationMethod) ||
    asText(row.method) ||
    asText(isolation.action) ||
    asText(isolation.method) ||
    "";
  const lockoutDeviceName =
    asText(row.lockoutDeviceName) ||
    asText(row.label) ||
    asText(row.deviceName) ||
    asText(isolation.lockoutDeviceName) ||
    asText(isolation.label) ||
    "";
  const verificationMethodName =
    asText(row.verificationMethodName) ||
    asText(row.verificationMethod) ||
    (typeof row.verification === "string" ? asText(row.verification) : "") ||
    asText(verification.name) ||
    asText(verification.label) ||
    asText(verification.method) ||
    "";
  const instruction =
    asText(row.instruction) || asText(row.text) || asText(row.stepText) || printed || "";
  const stepPhase = asText(row.stepPhase) || asText(row.phase) || "";
  const stepNumber = Number(row.stepNumber ?? row.order ?? row.sortOrder ?? index + 1);
  const placeholderOnly =
    /imported from pdf/i.test(printed) &&
    !asText(row.energySourceName) &&
    !asText(row.lockoutDeviceName) &&
    !asText(row.isolationLocationText) &&
    !customDescription &&
    !descriptionCode;

  return {
    energySourceName,
    energyMagnitude,
    energyNotes,
    isolationLocationText,
    isolationAction,
    lockoutDeviceName,
    verificationMethodName,
    instruction,
    stepPhase,
    stepNumber: Number.isFinite(stepNumber) && stepNumber > 0 ? stepNumber : index + 1,
    placeholderOnly,
    raw: row,
  };
}

function normalizeRestoration(raw, index) {
  if (typeof raw === "string") {
    const label = asText(raw);
    return label ? { label, checkKey: `restore-${index + 1}`, raw: { label } } : null;
  }
  const row = asRecord(raw);
  if (!row) return null;
  const label =
    asText(row.label) ||
    asText(row.text) ||
    asText(row.instruction) ||
    asText(row.checkLabel) ||
    asText(row.name) ||
    "";
  if (!label) return null;
  return {
    label,
    checkKey: asText(row.checkKey) || asText(row.key) || `restore-${index + 1}`,
    raw: row,
  };
}

function extractChildren(payload) {
  const steps = asArray(payload.steps).map((row, i) => normalizeStep(row, i));
  const usableSteps = steps.filter(
    (s) =>
      s.energySourceName ||
      s.instruction ||
      s.lockoutDeviceName ||
      s.isolationLocationText ||
      s.verificationMethodName,
  );
  const placeholderSteps = steps.filter((s) => s.placeholderOnly);
  const restorations = asArray(payload.restorationChecks)
    .map((row, i) => normalizeRestoration(row, i))
    .filter(Boolean);
  const standaloneEnergy = asArray(payload.energySources)
    .map((row, i) => normalizeStep(row, i))
    .filter((s) => s.energySourceName);
  const standalonePoints = asArray(payload.isolationPoints)
    .map((row, i) => {
      const n = normalizeStep(row, i);
      return n.lockoutDeviceName || n.isolationLocationText ? n : null;
    })
    .filter(Boolean);

  return { usableSteps, placeholderSteps, restorations, standaloneEnergy, standalonePoints };
}

function mapStatus(raw) {
  const s = asText(raw).toUpperCase().replace(/\s+/g, "_");
  if (!s) return null;
  if (["DRAFT", "ACTIVE", "APPROVED", "ARCHIVED", "INACTIVE", "REVIEW"].includes(s)) return s;
  if (s === "PUBLISHED" || s === "CURRENT") return "ACTIVE";
  if (s === "PENDING" || s === "PENDING_REVIEW") return "DRAFT";
  return s.slice(0, 64);
}

/** DB check: SHUTDOWN | ISOLATION | VERIFICATION | RESTART | OTHER */
function mapStepPhase(raw) {
  const s = asText(raw).toUpperCase().replace(/\s+/g, "_");
  if (["SHUTDOWN", "ISOLATION", "VERIFICATION", "RESTART", "OTHER"].includes(s)) return s;
  if (["RESTORE", "RESTORATION", "STARTUP", "REENERGIZE"].includes(s)) return "RESTART";
  if (["VERIFY", "ZERO_ENERGY", "TRY_START"].includes(s)) return "VERIFICATION";
  if (["LOCKOUT", "TAGOUT", "ISOLATE"].includes(s)) return "ISOLATION";
  if (["PREP", "PREPARE", "NOTIFY"].includes(s)) return "SHUTDOWN";
  return "ISOLATION";
}

function normalizeSiteLabel(raw) {
  return asText(raw)
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveSiteId(siteByName, ...labels) {
  let firstLabel = "";
  for (const label of labels) {
    const text = asText(label);
    if (!text) continue;
    if (!firstLabel) firstLabel = text;
    const key = normalizeSiteLabel(text);
    if (siteByName.has(key)) return { siteId: siteByName.get(key), siteLabel: text };
    const first = key.split(" / ")[0]?.trim();
    if (first && siteByName.has(first)) {
      return { siteId: siteByName.get(first), siteLabel: text };
    }
  }
  return { siteId: null, siteLabel: firstLabel };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const [counts] = await sql`
      select
        (select count(*)::int from industrial_loto_procedures
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as procedures,
        (select count(*)::int from industrial_loto_energy_sources
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as energy,
        (select count(*)::int from industrial_loto_isolation_points
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as isolation,
        (select count(*)::int from industrial_loto_steps
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as steps,
        (select count(*)::int from industrial_loto_records
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as lockouts,
        (select count(*)::int from industrial_loto_procedures
          where tenant_id = ${tenant.id}::uuid and archived_at is null and site_id is not null) as with_site
    `;

    let procedures = await sql`
      select
        p.id::text as id,
        p.title,
        p.procedure_number,
        p.revision,
        p.status,
        p.equipment_id::text as equipment_id,
        p.site_id::text as site_id,
        p.source_document_id,
        p.source_payload,
        (select count(*)::int from industrial_loto_energy_sources e
          where e.procedure_id = p.id and e.archived_at is null) as energy_count,
        (select count(*)::int from industrial_loto_isolation_points i
          where i.procedure_id = p.id and i.archived_at is null) as isolation_count,
        (select count(*)::int from industrial_loto_steps s
          where s.procedure_id = p.id and s.archived_at is null) as step_count
      from industrial_loto_procedures p
      where p.tenant_id = ${tenant.id}::uuid
        and p.archived_at is null
      order by p.updated_at desc
    `;
    if (LIMIT > 0) procedures = procedures.slice(0, LIMIT);

    const equipmentMap = new Map();
    try {
      const equipRows = await sql`
        select source_document_id, target_id::text as target_id
        from industrial_migration_id_map
        where aws_tenant_id = ${tenant.id}::uuid
          and target_entity in ('industrial_equipment', 'equipment', 'equipmentRecords')
      `;
      for (const row of equipRows) {
        if (row.source_document_id && row.target_id) {
          equipmentMap.set(String(row.source_document_id), row.target_id);
        }
      }
    } catch {
      // Optional mapping table.
    }

    const equipmentByNumber = new Map();
    const equipAssets = await sql`
      select id::text as id, equipment_number, name
      from industrial_equipment
      where tenant_id = ${tenant.id}::uuid and archived_at is null
    `;
    for (const row of equipAssets) {
      if (row.equipment_number) equipmentByNumber.set(String(row.equipment_number).trim(), row.id);
      if (row.name) equipmentByNumber.set(String(row.name).trim().toLowerCase(), row.id);
    }

    const siteByName = new Map();
    const siteRows = await sql`
      select id::text as id, name
      from industrial_sites
      where tenant_id = ${tenant.id}::uuid and archived_at is null
    `;
    for (const row of siteRows) {
      const key = normalizeSiteLabel(row.name);
      if (key && !siteByName.has(key)) siteByName.set(key, row.id);
      const firstToken = key.split(" / ")[0]?.trim();
      if (firstToken && !siteByName.has(firstToken)) siteByName.set(firstToken, row.id);
    }

    const report = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      apply: APPLY,
      force: FORCE,
      beforeCounts: counts,
      siteCatalog: siteRows.map((r) => r.name),
      considered: procedures.length,
      skippedAlreadySeeded: 0,
      skippedNoSourceSteps: 0,
      seeded: 0,
      updatedProcedure: 0,
      siteLinked: 0,
      siteUnresolved: 0,
      energyInserted: 0,
      isolationInserted: 0,
      stepsInserted: 0,
      placeholderProcedureCount: 0,
      richProcedureCount: 0,
      payloadStepKeySamples: {},
      siteNameSamples: {},
      samples: [],
      emptyPayloadSamples: [],
      unresolvedSiteSamples: [],
    };

    for (const proc of procedures) {
      const hasChildren =
        Number(proc.energy_count) > 0 ||
        Number(proc.isolation_count) > 0 ||
        Number(proc.step_count) > 0;

      const payload = unwrapPayload(proc.source_payload);
      const children = extractChildren(payload);

      const nextTitle =
        asText(payload.title) ||
        asText(payload.equipmentName) ||
        asText(proc.title) ||
        "LOTO Procedure";
      const nextNumber =
        asText(payload.procedureNumber) || asText(proc.procedure_number) || null;
      const nextRevision = asText(payload.revision) || asText(proc.revision) || "1";
      const nextStatus = mapStatus(payload.status) || asText(proc.status) || "DRAFT";

      let equipmentId = proc.equipment_id;
      const externalId =
        asText(payload.equipmentExternalId) ||
        asText(payload.equipmentId) ||
        asText(payload.equipmentDocId) ||
        "";
      if (!equipmentId && externalId) {
        equipmentId = equipmentMap.get(externalId) || equipmentByNumber.get(externalId) || null;
      }
      if (!equipmentId && asText(payload.equipmentName)) {
        equipmentId =
          equipmentByNumber.get(asText(payload.equipmentName).toLowerCase()) || null;
      }

      const siteResolved = resolveSiteId(
        siteByName,
        asText(payload.siteNameSnapshot),
        asText(payload.siteName),
        asText(payload.site),
        asText(payload.leftFooter),
        asText(payload.areaNameSnapshot),
        asText(payload.areaName),
      );
      const siteId = proc.site_id || siteResolved.siteId;
      const siteLabel = siteResolved.siteLabel;
      if (siteLabel) {
        report.siteNameSamples[siteLabel] = (report.siteNameSamples[siteLabel] ?? 0) + 1;
      }
      if (siteId) report.siteLinked += 1;
      else if (siteLabel) {
        report.siteUnresolved += 1;
        if (report.unresolvedSiteSamples.length < 12) {
          report.unresolvedSiteSamples.push({ id: proc.id, title: nextTitle, siteLabel });
        }
      }

      // Always persist site/equipment/status from Firebase when applying,
      // even if child rows were seeded in an earlier pass.
      if (APPLY && (siteId || equipmentId || nextTitle !== asText(proc.title))) {
        const nowMeta = new Date();
        await sql`
          update industrial_loto_procedures
          set
            title = ${nextTitle},
            procedure_number = ${nextNumber},
            revision = ${nextRevision},
            status = ${nextStatus},
            equipment_id = ${equipmentId || proc.equipment_id || null},
            site_id = ${siteId || proc.site_id || null},
            updated_at = ${nowMeta}
          where id = ${proc.id}::uuid
            and tenant_id = ${tenant.id}::uuid
        `;
        report.updatedProcedure += 1;
      }

      if (hasChildren && !FORCE) {
        report.skippedAlreadySeeded += 1;
        continue;
      }

      const hasSource =
        children.usableSteps.length > 0 ||
        children.restorations.length > 0 ||
        children.standaloneEnergy.length > 0 ||
        children.standalonePoints.length > 0;

      if (!hasSource) {
        report.skippedNoSourceSteps += 1;
        if (report.emptyPayloadSamples.length < 8) {
          report.emptyPayloadSamples.push({
            id: proc.id,
            title: proc.title,
            sourceDocumentId: proc.source_document_id,
            payloadKeys: Object.keys(payload).slice(0, 40),
            stepsType: Array.isArray(payload.steps)
              ? `array:${payload.steps.length}`
              : typeof payload.steps,
            firstStep:
              Array.isArray(payload.steps) && payload.steps[0] ? payload.steps[0] : null,
          });
        }
        continue;
      }

      if (
        children.placeholderSteps.length > 0 &&
        children.placeholderSteps.length === children.usableSteps.length
      ) {
        report.placeholderProcedureCount += 1;
      } else {
        report.richProcedureCount += 1;
      }

      for (const step of children.usableSteps.slice(0, 3)) {
        for (const key of Object.keys(step.raw)) {
          report.payloadStepKeySamples[key] = (report.payloadStepKeySamples[key] ?? 0) + 1;
        }
      }

      const plan = {
        id: proc.id,
        title: nextTitle,
        procedureNumber: nextNumber,
        revision: nextRevision,
        status: nextStatus,
        equipmentId,
        siteId,
        siteLabel: siteLabel || null,
        areaName: asText(payload.areaNameSnapshot) || asText(payload.areaName) || null,
        processLine: asText(payload.processLine) || null,
        steps: children.usableSteps.length,
        placeholders: children.placeholderSteps.length,
        restorations: children.restorations.length,
        standaloneEnergy: children.standaloneEnergy.length,
        standalonePoints: children.standalonePoints.length,
        beforeChildren: {
          energy: proc.energy_count,
          isolation: proc.isolation_count,
          steps: proc.step_count,
        },
      };
      if (report.samples.length < 8) report.samples.push(plan);

      if (!APPLY) continue;

      const now = new Date();

      if (FORCE && hasChildren) {
        await sql`
          update industrial_loto_energy_sources
          set archived_at = ${now}, updated_at = ${now}
          where tenant_id = ${tenant.id}::uuid
            and procedure_id = ${proc.id}::uuid
            and archived_at is null
        `;
        await sql`
          update industrial_loto_isolation_points
          set archived_at = ${now}, updated_at = ${now}
          where tenant_id = ${tenant.id}::uuid
            and procedure_id = ${proc.id}::uuid
            and archived_at is null
        `;
        await sql`
          update industrial_loto_steps
          set archived_at = ${now}, updated_at = ${now}
          where tenant_id = ${tenant.id}::uuid
            and procedure_id = ${proc.id}::uuid
            and archived_at is null
        `;
      }

      const nextEquipmentId = equipmentId || proc.equipment_id || null;
      const nextSiteId = siteId || proc.site_id || null;
      await sql`
        update industrial_loto_procedures
        set
          source_payload = ${sql.json({
            ...payload,
            _lotoChildBackfill: {
              at: now.toISOString(),
              steps: children.usableSteps.length,
              restorations: children.restorations.length,
              siteId: nextSiteId,
              siteLabel: siteLabel || null,
              areaName: asText(payload.areaNameSnapshot) || asText(payload.areaName) || null,
              processLine: asText(payload.processLine) || null,
            },
          })},
          updated_at = ${now}
        where id = ${proc.id}::uuid
          and tenant_id = ${tenant.id}::uuid
      `;

      const energyIds = [];

      for (const [index, row] of children.standaloneEnergy.entries()) {
        const energyId = randomUUID();
        energyIds.push(energyId);
        await sql`
          insert into industrial_loto_energy_sources (
            id, tenant_id, procedure_id, energy_type, description, magnitude, sort_order,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${energyId}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
            ${row.energySourceName}, ${row.energyNotes || null}, ${row.energyMagnitude || null},
            ${index}, ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
            ${sql.json(row.raw)}, ${now}, ${now}
          )
        `;
        report.energyInserted += 1;
      }

      for (const [index, row] of children.usableSteps.entries()) {
        let energyId = null;
        if (row.energySourceName) {
          energyId = randomUUID();
          energyIds.push(energyId);
          await sql`
            insert into industrial_loto_energy_sources (
              id, tenant_id, procedure_id, energy_type, description, magnitude, sort_order,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${energyId}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
              ${row.energySourceName}, ${row.energyNotes || null}, ${row.energyMagnitude || null},
              ${energyIds.length + index}, ${SOURCE_SYSTEM}, 'lotoProcedures',
              ${proc.source_document_id}, ${sql.json(row.raw)}, ${now}, ${now}
            )
          `;
          report.energyInserted += 1;
        }

        const hasIsolationDetail = Boolean(
          row.lockoutDeviceName || row.isolationLocationText || row.isolationAction || energyId,
        );
        let isolationId = null;
        if (hasIsolationDetail) {
          const isolationLabel =
            row.lockoutDeviceName ||
            row.isolationLocationText ||
            row.energySourceName ||
            `Point ${index + 1}`;
          isolationId = randomUUID();
          await sql`
            insert into industrial_loto_isolation_points (
              id, tenant_id, procedure_id, energy_source_id, label, location_description,
              isolation_method, sort_order,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${isolationId}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
              ${energyId}, ${isolationLabel},
              ${row.isolationLocationText || null}, ${row.isolationAction || null}, ${index},
              ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
              ${sql.json(row.raw)}, ${now}, ${now}
            )
          `;
          report.isolationInserted += 1;
        }

        const instruction =
          row.instruction ||
          [
            row.energySourceName && `Isolate ${row.energySourceName}`,
            row.energyMagnitude && `(${row.energyMagnitude})`,
            row.isolationLocationText && `at ${row.isolationLocationText}`,
            row.isolationAction && `by ${row.isolationAction}`,
            row.lockoutDeviceName && `using ${row.lockoutDeviceName}`,
          ]
            .filter(Boolean)
            .join(" ") ||
          `Isolation step ${index + 1}`;

        const stepPhase = mapStepPhase(row.stepPhase);
        const isolationStepNumber =
          stepPhase === "VERIFICATION" ? row.stepNumber : row.stepNumber * 2 - 1;
        await sql`
          insert into industrial_loto_steps (
            id, tenant_id, procedure_id, step_phase, step_number, instruction,
            isolation_point_id, is_verification,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
            ${stepPhase}, ${isolationStepNumber}, ${instruction},
            ${isolationId}, false,
            ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
            ${sql.json(row.raw)}, ${now}, ${now}
          )
        `;
        report.stepsInserted += 1;

        if (row.verificationMethodName && isolationId) {
          await sql`
            insert into industrial_loto_steps (
              id, tenant_id, procedure_id, step_phase, step_number, instruction,
              isolation_point_id, is_verification,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
              'VERIFICATION', ${row.stepNumber * 2},
              ${`Verify zero energy: ${row.verificationMethodName}`},
              ${isolationId}::uuid, true,
              ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
              ${sql.json({ ...row.raw, verification: row.verificationMethodName })},
              ${now}, ${now}
            )
          `;
          report.stepsInserted += 1;
        }
      }

      for (const [index, row] of children.standalonePoints.entries()) {
        const label = row.lockoutDeviceName || row.isolationLocationText || `Point ${index + 1}`;
        const linkedEnergy = energyIds[0] ?? null;
        await sql`
          insert into industrial_loto_isolation_points (
            id, tenant_id, procedure_id, energy_source_id, label, location_description,
            isolation_method, sort_order,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
            ${linkedEnergy}, ${label},
            ${row.isolationLocationText || null}, ${row.isolationAction || null},
            ${1000 + index}, ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
            ${sql.json(row.raw)}, ${now}, ${now}
          )
        `;
        report.isolationInserted += 1;
      }

      for (const [index, row] of children.restorations.entries()) {
        await sql`
          insert into industrial_loto_steps (
            id, tenant_id, procedure_id, step_phase, step_number, instruction,
            isolation_point_id, is_verification,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${proc.id}::uuid,
            'RESTART', ${9000 + index}, ${row.label},
            null, false,
            ${SOURCE_SYSTEM}, 'lotoProcedures', ${proc.source_document_id},
            ${sql.json(row.raw)}, ${now}, ${now}
          )
        `;
        report.stepsInserted += 1;
      }

      report.seeded += 1;
    }

    const [afterCounts] = await sql`
      select
        (select count(*)::int from industrial_loto_energy_sources
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as energy,
        (select count(*)::int from industrial_loto_isolation_points
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as isolation,
        (select count(*)::int from industrial_loto_steps
          where tenant_id = ${tenant.id}::uuid and archived_at is null) as steps,
        (select count(*)::int from industrial_loto_procedures
          where tenant_id = ${tenant.id}::uuid and archived_at is null and site_id is not null) as with_site
    `;
    report.afterCounts = afterCounts;

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
