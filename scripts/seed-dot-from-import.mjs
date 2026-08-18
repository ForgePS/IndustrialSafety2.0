/**
 * producers-rice-mill only: seed industrial_dot_compliance_records from imported
 * fleet drivers / vehicles (and normalize existing import DOT rows).
 *
 * Sources:
 * - existing industrial_dot_compliance_records → ensure category in source_payload
 * - industrial_fleet_vehicles → Vehicles category
 *
 * Company vehicle drivers (insurance / MVR roster) and is_company_driver
 * personnel stay in Company Drivers — they are not Drivers (DQF).
 *
 * Idempotent on (tenant_id, source_collection, source_document_id).
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-dot-from-import.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-dot-from-import.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const VEHICLE_SOURCE = "fleetVehicles";

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
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return { ...current };
    }
    return {};
  }
  return {};
}

function isCompanyDriverSource(row, payload = unwrap(row.source_payload)) {
  const seeded = String(payload.seededFrom ?? "").toLowerCase();
  const collection = String(row.source_collection ?? "").toLowerCase();
  const path = String(row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) {
    return true;
  }
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") {
    return true;
  }
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

function isRealDqf(row, payload = unwrap(row.source_payload)) {
  const hay = [
    row.source_document_id,
    row.source_path,
    row.title,
    payload.sourceDocumentId,
    payload.recordNumber,
    payload.createdByName,
    JSON.stringify(payload),
  ]
    .map((value) => String(value ?? ""))
    .join(" ");
  if (/\bDRV-\d{4}-\d+\b/i.test(hay)) return true;
  if (/dqf\s*import/i.test(hay)) return true;
  if (/dot-compliance\/[^/]+\/drivers\/DRV-/i.test(hay)) return true;
  return false;
}

function inferCategory(row) {
  const payload = unwrap(row.source_payload);
  if (isCompanyDriverSource(row, payload) && !isRealDqf(row, payload)) return "other";
  const cat = String(payload.category ?? row.category ?? "").toLowerCase();
  if (isRealDqf(row, payload) || cat.includes("dqf")) return "drivers";
  if (cat.includes("driver") && !isCompanyDriverSource(row, payload)) return "drivers";
  if (cat.includes("vehicle")) return "vehicles";
  if (cat.includes("company")) return "company";
  const collection = String(row.source_collection ?? row.source_path ?? "").toLowerCase();
  if (collection.includes("dqf") || /\/drivers\/drv-/i.test(collection)) return "drivers";
  if (collection.includes("driver") && !collection.includes("companyvehicle")) return "drivers";
  if (collection.includes("vehicle") || collection.includes("fleet")) return "vehicles";
  if (collection.includes("company") || collection.includes("dot-compliance/company")) {
    return "company";
  }
  return "other";
}

function vehicleDocId(row) {
  const vin = String(row.vin ?? "").trim();
  if (vin) return `vin:${vin}`;
  const unit = String(row.asset_number ?? row.unit_number ?? row.unitNumber ?? "").trim();
  if (unit) return `unit:${unit}`;
  return `fleet-vehicle:${row.id}`;
}

function deterministicId(parts) {
  const h = createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function vehicleStatus(row, payload) {
  const raw = String(payload.status ?? row.status ?? "ACTIVE").trim();
  return raw || "ACTIVE";
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
    const tenantId = tenant.id;

    const existingDot = await sql`
      select
        id::text as id,
        title,
        status,
        personnel_id::text as personnel_id,
        source_collection,
        source_document_id,
        source_path,
        source_payload
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    const bySource = new Set(
      existingDot
        .filter((r) => r.source_collection && r.source_document_id)
        .map((r) => `${r.source_collection}::${r.source_document_id}`),
    );

    let categorized = 0;
    for (const row of existingDot) {
      const payload = unwrap(row.source_payload);
      if (payload.category) continue;
      const category = inferCategory(row);
      categorized += 1;
      if (APPLY) {
        await sql`
          update industrial_dot_compliance_records
          set source_payload = ${sql.json({ ...payload, category })},
              updated_at = now()
          where id = ${row.id}::uuid
        `;
      }
    }

    const fleetDrivers = { length: 0 };
    const driversInserted = 0;
    const driversSkipped = 0;
    const driverSamples = [];

    const companyPersonnel = { length: 0 };
    const personnelInserted = 0;
    const personnelSkipped = 0;
    const personnelSamples = [];

    const fleetVehicles = await sql`
      select
        id::text as id,
        vin,
        asset_number,
        year,
        make,
        model,
        status,
        asset_type,
        license_plate,
        source_system,
        source_collection,
        source_document_id,
        source_path,
        source_payload,
        archived_at is not null as archived
      from industrial_fleet_vehicles
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    let vehiclesInserted = 0;
    let vehiclesSkipped = 0;
    const vehicleSamples = [];

    for (const row of fleetVehicles) {
      const payload = unwrap(row.source_payload);
      const docId = vehicleDocId(row);
      const sourceCollection = String(row.source_collection || VEHICLE_SOURCE).trim() || VEHICLE_SOURCE;
      const sourceKey = `${sourceCollection}::${docId}`;
      if (bySource.has(sourceKey)) {
        vehiclesSkipped += 1;
        continue;
      }

      const labelParts = [
        row.year,
        row.make,
        row.model,
        row.asset_number ? `Unit ${row.asset_number}` : null,
        row.vin ? `VIN ${row.vin}` : null,
      ].filter(Boolean);
      const title = labelParts.join(" ") || `Vehicle ${docId}`;
      const status = vehicleStatus(row, payload);
      const id = deterministicId(["dot-vehicle", tenantId, sourceCollection, docId]);
      const sourcePayload = {
        ...payload,
        category: "vehicles",
        vin: row.vin ?? payload.vin ?? null,
        unitNumber: row.asset_number ?? payload.unitNumber ?? null,
        licensePlate: row.license_plate ?? payload.licensePlate ?? null,
        assetType: row.asset_type ?? payload.assetType ?? null,
        fleetVehicleId: row.id,
        seededFrom: "industrial_fleet_vehicles",
      };

      vehiclesInserted += 1;
      if (vehicleSamples.length < 8) {
        vehicleSamples.push({ title, status, sourceCollection, docId });
      }
      if (APPLY) {
        await sql`
          insert into industrial_dot_compliance_records (
            id, tenant_id, title, status,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, ${status},
            ${String(row.source_system || "FORGE")},
            ${sourceCollection}, ${docId},
            ${row.source_path || `dot-compliance/vehicles/${docId}`},
            ${sql.json(sourcePayload)},
            now(), now()
          )
          on conflict do nothing
        `;
        bySource.add(sourceKey);
      }
    }

    let dqfTagged = 0;
    for (const row of existingDot) {
      const payload = unwrap(row.source_payload);
      if (!isRealDqf(row, payload) || isCompanyDriverSource(row, payload)) continue;
      if (payload.dqf === true && payload.category === "drivers") continue;
      dqfTagged += 1;
      if (APPLY) {
        await sql`
          update industrial_dot_compliance_records
          set source_payload = ${sql.json({ ...payload, category: "drivers", dqf: true })},
              updated_at = now()
          where id = ${row.id}::uuid
        `;
      }
    }

    const incidents = await sql`
      select
        id::text as id,
        title,
        status,
        source_system,
        source_collection,
        source_document_id,
        source_path,
        source_payload
      from industrial_incidents
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;
    let accidentsInserted = 0;
    for (const row of incidents) {
      const payload = unwrap(row.source_payload);
      const hay = `${row.title ?? ""} ${payload.category ?? ""} ${payload.incidentCategory ?? ""} ${payload.type ?? ""}`.toLowerCase();
      if (!/(auto|vehicle|crash|collision|accident|roadside)/.test(hay)) continue;
      const docId = String(row.source_document_id || row.id).trim();
      const sourceCollection = "dotAccidentsFromIncidents";
      const sourceKey = `${sourceCollection}::${docId}`;
      if (bySource.has(sourceKey)) continue;
      const title = String(row.title || payload.title || `Accident ${docId}`).trim();
      const id = deterministicId(["dot-accident", tenantId, sourceCollection, docId]);
      accidentsInserted += 1;
      if (APPLY) {
        await sql`
          insert into industrial_dot_compliance_records (
            id, tenant_id, title, status,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, ${String(row.status || "OPEN")},
            ${String(row.source_system || "FIREBASE")},
            ${sourceCollection}, ${docId},
            ${`dot-compliance/accidents/${docId}`},
            ${sql.json({ ...payload, category: "accidents", incidentId: row.id, seededFrom: "industrial_incidents" })},
            now(), now()
          )
          on conflict do nothing
        `;
        bySource.add(sourceKey);
      }
    }

    const inspections = await sql`
      select
        id::text as id,
        title,
        status,
        source_system,
        source_collection,
        source_document_id,
        source_path,
        source_payload
      from industrial_inspections
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;
    let dvirsInserted = 0;
    for (const row of inspections) {
      const payload = unwrap(row.source_payload);
      const hay = `${row.title ?? ""} ${payload.category ?? ""} ${payload.type ?? ""} ${payload.inspectionType ?? ""}`.toLowerCase();
      if (!/\bdvir\b|pre[-\s]?trip|post[-\s]?trip|vehicle inspection/.test(hay)) continue;
      const docId = String(row.source_document_id || row.id).trim();
      const sourceCollection = "dotDvirsFromInspections";
      const sourceKey = `${sourceCollection}::${docId}`;
      if (bySource.has(sourceKey)) continue;
      const title = String(row.title || payload.title || `DVIR ${docId}`).trim();
      const id = deterministicId(["dot-dvir", tenantId, sourceCollection, docId]);
      dvirsInserted += 1;
      if (APPLY) {
        await sql`
          insert into industrial_dot_compliance_records (
            id, tenant_id, title, status,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, ${String(row.status || "OPEN")},
            ${String(row.source_system || "FIREBASE")},
            ${sourceCollection}, ${docId},
            ${`dot-compliance/dvirs/${docId}`},
            ${sql.json({ ...payload, category: "dvirs", inspectionId: row.id, seededFrom: "industrial_inspections" })},
            now(), now()
          )
          on conflict do nothing
        `;
        bySource.add(sourceKey);
      }
    }

    const [counts] = await sql`
      select
        count(*)::int as total,
        count(*) filter (where archived_at is null)::int as active
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
    `;

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId,
          apply: APPLY,
          existingDot: existingDot.length,
          categorizedExisting: categorized,
          fleetDrivers: fleetDrivers.length,
          driversInserted,
          driversSkipped,
          driverSamples,
          companyPersonnel: companyPersonnel.length,
          personnelInserted,
          personnelSkipped,
          personnelSamples,
          dqfTagged,
          accidentsInserted,
          dvirsInserted,
          fleetVehicles: fleetVehicles.length,
          vehiclesInserted,
          vehiclesSkipped,
          vehicleSamples,
          dotTotalsAfter: counts,
          note: APPLY
            ? "Applied DOT seed. Company drivers were not written as Drivers (DQF)."
            : "Dry-run only. Re-run with APPLY=1 to write.",
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
