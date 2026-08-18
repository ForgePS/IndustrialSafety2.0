/**
 * Seed Fleet assets from Vehicle Spreadsheet export for producers-rice-mill only.
 *
 * Expects FLEET_VEHICLES_JSON_PATH (JSON object keyed by sheet name) or
 * FLEET_VEHICLES_JSON inline.
 *
 * Dry-run by default. APPLY=1 writes.
 * Optional LIMIT=N processes only the first N rows across all sheets.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-fleet-from-spreadsheet.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-fleet-from-spreadsheet.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
const LIMIT = Number(process.env.LIMIT || "0");
const ALLOWED = new Set(["producers-rice-mill"]);
const SOURCE_SYSTEM = "VEHICLE_SPREADSHEET";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

const SHEET_DEFAULTS = {
  Personal: { assetType: "PASSENGER_VEHICLE", status: "ACTIVE" },
  Fleet: { assetType: "FLEET_VEHICLE", status: "ACTIVE" },
  "Bob-Trash Trucks": { assetType: "BOB_TRUCK", status: "ACTIVE" },
  "Big Trucks": { assetType: "TRACTOR_TRUCK", status: "ACTIVE" },
  "Const. Equipment": { assetType: "CONSTRUCTION_EQUIPMENT", status: "ACTIVE" },
  Removed: { assetType: "FLEET_VEHICLE", status: "REMOVED" },
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

function loadPayload() {
  const path = (process.env.FLEET_VEHICLES_JSON_PATH || "").trim();
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const inline = (process.env.FLEET_VEHICLES_JSON || "").trim();
  if (inline) return JSON.parse(inline);
  throw new Error("Set FLEET_VEHICLES_JSON_PATH or FLEET_VEHICLES_JSON");
}

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function asInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asBool(value) {
  const s = str(value).toLowerCase();
  if (!s) return null;
  if (s === "x" || s === "y" || s === "yes" || s === "true" || s === "1") return true;
  if (s === "n" || s === "no" || s === "false" || s === "0") return false;
  return null;
}

function monthFromRenewal(raw) {
  const s = str(raw).toLowerCase();
  if (!s || s === "n/a") return null;
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const idx = months.findIndex((m) => m.startsWith(s.slice(0, 3)));
  return idx >= 0 ? idx + 1 : null;
}

function inferAssetType(sheet, model) {
  const base = SHEET_DEFAULTS[sheet]?.assetType || "FLEET_VEHICLE";
  const m = str(model).toLowerCase();
  if (sheet === "Bob-Trash Trucks") {
    if (m.includes("trash")) return "TRASH_TRUCK";
    return "BOB_TRUCK";
  }
  if (sheet === "Big Trucks") {
    if (m.includes("dump")) return "DUMP_TRUCK";
    return "TRACTOR_TRUCK";
  }
  return base;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && str(row[k]) !== "") return row[k];
  }
  return null;
}

function mapRow(sheet, row) {
  const defaults = SHEET_DEFAULTS[sheet] || { assetType: "FLEET_VEHICLE", status: "ACTIVE" };
  const vin = str(pick(row, ["VIN Number", "VIN", "vin"])).toUpperCase().replace(/[\s-]/g, "") || null;
  const model = str(pick(row, ["Model", "model"]));
  const insured = asBool(pick(row, ["Insured?", "Insured", "insured"]));
  const fringe = asBool(pick(row, ["not on vehicle fringe SS"]));
  const commuteRaw = pick(row, [
    "driving vehicles to/from work - email to Kent 1/7/26",
    "commute",
  ]);
  const form2290 = pick(row, [2290, "2290"]);
  const irp = pick(row, ["IRP", "irp"]);
  const ren = pick(row, ["Ren Date", "renewal_date"]);
  const notesParts = [str(pick(row, ["Notes", "notes"]))];
  if (sheet === "Removed" && !notesParts[0]) {
    // Removed sheet sometimes puts reason in trailing unnamed cells — already in Notes if present
  }
  return {
    sheet,
    sourceDocumentId: vin || `${sheet}:${str(pick(row, ["Year"]))}:${str(pick(row, ["Make"]))}:${model}:${str(pick(row, ["License"]))}`,
    assetType: inferAssetType(sheet, model),
    status: defaults.status,
    year: asInt(pick(row, ["Year", "year"])),
    make: str(pick(row, ["Make", "make"])) || null,
    model: model || null,
    color: str(pick(row, ["Color", "color"])) || null,
    vin,
    licensePlate: str(pick(row, ["License", "license_plate", "license"])) || null,
    registrationRenewalMonth: monthFromRenewal(ren),
    locationName: str(pick(row, ["Location", "location"])) || null,
    assignedDriverName: (() => {
      const n = str(pick(row, ["Assigned Driver", "assigned_driver"]));
      return !n || n.toUpperCase() === "N/A" ? null : n;
    })(),
    countyAssessed: str(pick(row, ["County Assessed", "county_assessed"])) || null,
    insured,
    insuranceStatus: insured === true ? "INSURED" : insured === false ? "NOT_INSURED" : "UNKNOWN",
    mileage: asInt(pick(row, ["Mileage", "mileage"])),
    notOnVehicleFringeSs: fringe,
    vehicleFringe: fringe,
    commuteUseStatus: commuteRaw != null && str(commuteRaw) ? "YES" : sheet === "Fleet" ? "UNKNOWN" : null,
    commuteUseNotes: commuteRaw != null ? str(commuteRaw) || null : null,
    form2290Status: form2290 != null && str(form2290) ? "FILED" : sheet.includes("Truck") ? "UNKNOWN" : null,
    form2290Notes: form2290 != null ? str(form2290) || null : null,
    irpStatus: irp != null && str(irp) ? "FILED" : sheet.includes("Truck") ? "UNKNOWN" : null,
    irpNotes: irp != null ? str(irp) || null : null,
    notes: notesParts.filter(Boolean).join(" | ") || null,
    dispositionStatus: defaults.status === "REMOVED" ? "REMOVED" : null,
    dispositionNotes: defaults.status === "REMOVED" ? notesParts.filter(Boolean).join(" | ") || null : null,
    sourcePayload: { sheet, ...row },
  };
}

function n(value) {
  return value === undefined ? null : value;
}

async function main() {
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
  const url = await resolveDatabaseUrl(secretArn);
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const payload = loadPayload();
    const [tenant] = await sql`
      select id, tenant_key, display_name
      from tenants
      where tenant_key = ${TENANT_KEY}
      limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const personnel = await sql`
      select id, display_name, first_name, last_name
      from industrial_personnel
      where tenant_id = ${tenant.id} and archived_at is null
    `;
    const nameIndex = new Map();
    for (const p of personnel) {
      const full = str(p.display_name).toLowerCase();
      if (full) nameIndex.set(full, p.id);
      const fl = `${str(p.first_name)} ${str(p.last_name)}`.trim().toLowerCase();
      if (fl) nameIndex.set(fl, p.id);
    }

    const rows = [];
    for (const [sheet, list] of Object.entries(payload)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) rows.push(mapRow(sheet, raw));
    }
    const limited = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

    const bySheet = {};
    let inserts = 0;
    let updates = 0;
    let skipped = 0;

    for (const r of limited) {
      bySheet[r.sheet] = (bySheet[r.sheet] ?? 0) + 1;
      const driverKey = str(r.assignedDriverName)
        .toLowerCase()
        .replace(/\s*\(.*?\)\s*/g, " ")
        .trim();
      const personnelId = driverKey
        ? n(nameIndex.get(driverKey) ?? nameIndex.get(str(r.assignedDriverName).toLowerCase()))
        : null;

      if (!APPLY) continue;

      await sql`select set_config('app.current_tenant_id', ${tenant.id}, true)`;

      let existing = null;
      if (r.vin) {
        const found = await sql`
          select id from industrial_fleet_vehicles
          where tenant_id = ${tenant.id} and vin = ${r.vin}
          limit 1
        `;
        existing = found[0] ?? null;
      }
      if (!existing && r.sourceDocumentId) {
        const found = await sql`
          select id from industrial_fleet_vehicles
          where tenant_id = ${tenant.id}
            and source_system = ${SOURCE_SYSTEM}
            and source_document_id = ${r.sourceDocumentId}
          limit 1
        `;
        existing = found[0] ?? null;
      }

      if (existing) {
        await sql`
          update industrial_fleet_vehicles set
            asset_type = ${n(r.assetType)},
            year = ${n(r.year)},
            make = ${n(r.make)},
            model = ${n(r.model)},
            color = ${n(r.color)},
            license_plate = ${n(r.licensePlate)},
            registration_renewal_month = ${n(r.registrationRenewalMonth)},
            location_name = ${n(r.locationName)},
            assigned_driver_personnel_id = ${personnelId},
            assigned_driver_name = ${n(r.assignedDriverName)},
            county_assessed = ${n(r.countyAssessed)},
            insured = ${n(r.insured)},
            insurance_status = ${n(r.insuranceStatus)},
            mileage = ${n(r.mileage)},
            not_on_vehicle_fringe_ss = ${n(r.notOnVehicleFringeSs)},
            vehicle_fringe = ${n(r.vehicleFringe)},
            commute_use_status = ${n(r.commuteUseStatus)},
            commute_use_notes = ${n(r.commuteUseNotes)},
            form_2290_status = ${n(r.form2290Status)},
            form_2290_notes = ${n(r.form2290Notes)},
            irp_status = ${n(r.irpStatus)},
            irp_notes = ${n(r.irpNotes)},
            notes = ${n(r.notes)},
            status = ${n(r.status)},
            disposition_status = ${n(r.dispositionStatus)},
            disposition_notes = ${n(r.dispositionNotes)},
            source_payload = ${sql.json(r.sourcePayload ?? {})},
            updated_at = now()
          where id = ${existing.id}
        `;
        updates += 1;
      } else {
        const id = randomUUID();
        await sql`
          insert into industrial_fleet_vehicles (
            id, tenant_id, asset_type, year, make, model, color, vin, license_plate,
            registration_renewal_month, location_name, assigned_driver_personnel_id,
            assigned_driver_name, county_assessed, insured, insurance_status, mileage,
            not_on_vehicle_fringe_ss, vehicle_fringe, commute_use_status, commute_use_notes,
            form_2290_status, form_2290_notes, irp_status, irp_notes, notes, status,
            disposition_status, disposition_notes, source_system, source_collection,
            source_document_id, source_payload, created_at, updated_at
          ) values (
            ${id}, ${tenant.id}, ${n(r.assetType)}, ${n(r.year)}, ${n(r.make)}, ${n(r.model)},
            ${n(r.color)}, ${n(r.vin)}, ${n(r.licensePlate)}, ${n(r.registrationRenewalMonth)},
            ${n(r.locationName)}, ${personnelId}, ${n(r.assignedDriverName)},
            ${n(r.countyAssessed)}, ${n(r.insured)}, ${n(r.insuranceStatus)}, ${n(r.mileage)},
            ${n(r.notOnVehicleFringeSs)}, ${n(r.vehicleFringe)}, ${n(r.commuteUseStatus)},
            ${n(r.commuteUseNotes)}, ${n(r.form2290Status)}, ${n(r.form2290Notes)},
            ${n(r.irpStatus)}, ${n(r.irpNotes)}, ${n(r.notes)}, ${n(r.status)},
            ${n(r.dispositionStatus)}, ${n(r.dispositionNotes)}, ${SOURCE_SYSTEM}, ${n(r.sheet)},
            ${n(r.sourceDocumentId)}, ${sql.json(r.sourcePayload ?? {})}, now(), now()
          )
        `;
        inserts += 1;
      }
    }

    if (!APPLY) skipped = limited.length;

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          apply: APPLY,
          totalMapped: limited.length,
          bySheet,
          inserts,
          updates,
          dryRunWouldProcess: APPLY ? undefined : skipped,
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
