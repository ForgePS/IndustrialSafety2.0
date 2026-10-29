/**
 * Enrich industrial_equipment for producers-rice-mill from Firebase assetRecords
 * stored in source_payload.
 *
 * - Unwraps double-encoded source_payload JSON strings
 * - Backfills typed columns: name, equipment_number, equipment_type, site_id, status
 * - Normalizes Firebase keys onto the payload the Equipment UI expects
 *   (equipmentName, assetTag, manufacturer, model, serialNumber, locationDetail, …)
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-equipment-from-source.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-equipment-from-source.mjs
 *   LIMIT=50 TENANT_KEY=producers-rice-mill node scripts/seed-equipment-from-source.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const LIMIT = Math.max(0, Number(process.env.LIMIT || "0") || 0);
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

function blank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function filled(value) {
  return !blank(value);
}

function asText(value) {
  if (blank(value)) return "";
  return String(value).trim();
}

function strOrNull(value) {
  const text = asText(value);
  return text || null;
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
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return { ...current };
    }
    return {};
  }
  return {};
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim(),
  );
}

function isPlaceholderName(name) {
  const text = asText(name);
  return !text || /^imported-/i.test(text);
}

function firstFilled(...values) {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
}

function normalizeEquipmentPayload(payload) {
  const out = { ...payload };
  const equipmentName = firstFilled(
    out.equipmentName,
    out.name,
    out.title,
    out.label,
    out.displayName,
  );
  const assetTag = firstFilled(out.assetTag, out.equipmentNumber, out.equipment_number);
  const externalEquipmentId = firstFilled(
    out.externalEquipmentId,
    out.external_equipment_id,
    out.assetId,
  );
  const equipmentType = firstFilled(out.equipmentType, out.category, out.type, out.equipment_type);
  const manufacturer = firstFilled(out.manufacturer, out.make);
  const model = firstFilled(out.model);
  const serialNumber = firstFilled(out.serialNumber, out.serial_number, out.serial);
  const locationDetail = firstFilled(out.locationDetail, out.location_detail, out.areaName);
  const siteName = firstFilled(out.site, out.siteName, out.locationName, out.location);
  const notes = firstFilled(out.notes);
  const condition = firstFilled(out.condition);
  const ownerName = firstFilled(out.ownerName, out.owner);

  if (equipmentName) out.equipmentName = equipmentName;
  if (assetTag) {
    out.assetTag = assetTag;
    if (blank(out.equipmentNumber)) out.equipmentNumber = assetTag;
  }
  if (externalEquipmentId) out.externalEquipmentId = externalEquipmentId;
  if (equipmentType) {
    out.equipmentType = equipmentType;
    if (blank(out.category)) out.category = equipmentType;
  }
  if (manufacturer) out.manufacturer = manufacturer;
  if (model) out.model = model;
  if (serialNumber) out.serialNumber = serialNumber;
  if (locationDetail) out.locationDetail = locationDetail;
  if (siteName) {
    out.site = siteName;
    if (blank(out.siteName)) out.siteName = siteName;
  }
  if (notes) out.notes = notes;
  if (condition) out.condition = condition;
  if (ownerName) out.ownerName = ownerName;

  out._equipmentColumnBackfill = {
    ...(typeof out._equipmentColumnBackfill === "object" && out._equipmentColumnBackfill
      ? out._equipmentColumnBackfill
      : {}),
    at: new Date().toISOString(),
    from: "seed-equipment-from-source",
  };

  return out;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant =
    await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant[0]) throw new Error(`tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant[0].id;

  const siteRows = await sql`
    select id::text as id, lower(trim(name)) as name_key
    from industrial_sites
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;
  const sitesById = new Map(siteRows.map((r) => [r.id, r.id]));
  const sitesByName = new Map(siteRows.filter((r) => r.name_key).map((r) => [r.name_key, r.id]));

  const idMapRows = await sql`
    select
      source_document_id,
      target_id::text as target_id,
      lower(target_entity) as target_entity
    from industrial_migration_id_map
    where aws_tenant_id = ${tenantId}::uuid
      and (
        lower(target_entity) like '%site%'
        or lower(source_collection) like '%site%'
        or lower(source_collection) like '%location%'
      )
  `;
  const siteIdBySourceDoc = new Map();
  for (const row of idMapRows) {
    if (!row.source_document_id || !row.target_id) continue;
    if (!sitesById.has(row.target_id)) continue;
    siteIdBySourceDoc.set(String(row.source_document_id), row.target_id);
  }

  function resolveSiteId(payload, currentSiteId) {
    if (filled(currentSiteId) && sitesById.has(String(currentSiteId))) {
      return String(currentSiteId);
    }
    const candidates = [payload.siteId, payload.site_id, payload.locationId, payload.location_id];
    for (const candidate of candidates) {
      const text = asText(candidate);
      if (!text) continue;
      if (isUuid(text) && sitesById.has(text)) return text;
      const mapped = siteIdBySourceDoc.get(text);
      if (mapped) return mapped;
    }
    const siteName = firstFilled(
      payload.site,
      payload.siteName,
      payload.locationName,
    ).toLowerCase();
    if (siteName && sitesByName.has(siteName)) return sitesByName.get(siteName);
    return filled(currentSiteId) ? String(currentSiteId) : null;
  }

  const rows = LIMIT
    ? await sql`
        select
          id::text as id,
          name,
          equipment_number,
          equipment_type,
          site_id::text as site_id,
          status,
          source_collection,
          source_document_id,
          source_payload
        from industrial_equipment
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
        order by updated_at desc
        limit ${LIMIT}
      `
    : await sql`
        select
          id::text as id,
          name,
          equipment_number,
          equipment_type,
          site_id::text as site_id,
          status,
          source_collection,
          source_document_id,
          source_payload
        from industrial_equipment
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
        order by updated_at desc
      `;

  let wouldUpdate = 0;
  let updated = 0;
  let skippedEmptyPayload = 0;
  const fieldCounts = {
    name: 0,
    equipment_number: 0,
    equipment_type: 0,
    site_id: 0,
    status: 0,
    payloadRewrite: 0,
  };
  const samples = [];

  for (const row of rows) {
    const payloadWasString = typeof row.source_payload === "string";
    const rawPayload = unwrapPayload(row.source_payload);
    if (Object.keys(rawPayload).length === 0) {
      skippedEmptyPayload += 1;
      continue;
    }

    const payload = normalizeEquipmentPayload(rawPayload);
    const nextName = isPlaceholderName(row.name)
      ? firstFilled(payload.equipmentName, row.name) || row.name
      : filled(row.name)
        ? row.name
        : firstFilled(payload.equipmentName) || row.name;
    const nextEquipmentNumber = filled(row.equipment_number)
      ? row.equipment_number
      : strOrNull(firstFilled(payload.assetTag, payload.equipmentNumber));
    const nextEquipmentType = filled(row.equipment_type)
      ? row.equipment_type
      : strOrNull(firstFilled(payload.equipmentType, payload.category, payload.type));
    const nextSiteId = resolveSiteId(payload, row.site_id);
    const nextStatus = filled(row.status)
      ? row.status
      : strOrNull(firstFilled(payload.status, payload.condition)) || "ACTIVE";

    const columnChanged =
      nextName !== (row.name ?? null) ||
      nextEquipmentNumber !== (row.equipment_number ?? null) ||
      nextEquipmentType !== (row.equipment_type ?? null) ||
      nextSiteId !== (row.site_id ?? null) ||
      nextStatus !== (row.status ?? null);

    const payloadNeedsRewrite =
      payloadWasString ||
      asText(payload.equipmentName) !== asText(rawPayload.equipmentName) ||
      asText(payload.assetTag) !== asText(rawPayload.assetTag) ||
      asText(payload.manufacturer) !== asText(rawPayload.manufacturer) ||
      asText(payload.model) !== asText(rawPayload.model) ||
      asText(payload.serialNumber) !== asText(rawPayload.serialNumber) ||
      asText(payload.locationDetail) !== asText(rawPayload.locationDetail) ||
      !rawPayload._equipmentColumnBackfill;

    if (!columnChanged && !payloadNeedsRewrite) continue;

    wouldUpdate += 1;
    if (nextName !== (row.name ?? null)) fieldCounts.name += 1;
    if (nextEquipmentNumber !== (row.equipment_number ?? null)) fieldCounts.equipment_number += 1;
    if (nextEquipmentType !== (row.equipment_type ?? null)) fieldCounts.equipment_type += 1;
    if (nextSiteId !== (row.site_id ?? null)) fieldCounts.site_id += 1;
    if (nextStatus !== (row.status ?? null)) fieldCounts.status += 1;
    if (payloadNeedsRewrite) fieldCounts.payloadRewrite += 1;

    if (samples.length < 8) {
      samples.push({
        id: row.id,
        sourceDocumentId: row.source_document_id,
        before: {
          name: row.name,
          equipment_number: row.equipment_number,
          equipment_type: row.equipment_type,
          site_id: row.site_id,
          payloadWasString,
        },
        after: {
          name: nextName,
          equipment_number: nextEquipmentNumber,
          equipment_type: nextEquipmentType,
          site_id: nextSiteId,
          equipmentName: payload.equipmentName ?? null,
          assetTag: payload.assetTag ?? null,
          manufacturer: payload.manufacturer ?? null,
          model: payload.model ?? null,
          serialNumber: payload.serialNumber ?? null,
          locationDetail: payload.locationDetail ?? null,
        },
      });
    }

    if (!APPLY) continue;

    await sql`
      update industrial_equipment
      set
        name = ${nextName},
        equipment_number = ${nextEquipmentNumber},
        equipment_type = ${nextEquipmentType},
        site_id = ${nextSiteId}::uuid,
        status = ${nextStatus},
        source_payload = ${sql.json(payload)},
        updated_at = now()
      where id = ${row.id}::uuid
        and tenant_id = ${tenantId}::uuid
    `;
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        scanned: rows.length,
        skippedEmptyPayload,
        wouldUpdate,
        updated,
        fieldCounts,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
