/**
 * producers-rice-mill only: anyone listed as the assigned driver on a fleet
 * vehicle is a company driver. Add them to industrial_fleet_drivers (Company
 * Drivers) if missing, and set personnel.is_company_driver.
 *
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/sync-fleet-assigned-to-company-drivers.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/sync-fleet-assigned-to-company-drivers.mjs
 */
import { randomUUID } from "node:crypto";
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
const ALLOWED = new Set(["producers-rice-mill"]);
const SKIP_VEHICLE_STATUS = new Set(["REMOVED", "SOLD", "DISPOSED", "ARCHIVED"]);

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

function normName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(JR|SR|II|III|IV)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(value) {
  const full = normName(value);
  const keys = new Set();
  if (!full) return keys;
  keys.add(full);
  const parts = full.split(" ").filter((part) => part.length > 1);
  if (parts.length >= 2) {
    keys.add(`${parts[0]} ${parts[parts.length - 1]}`);
    keys.add(`${parts[parts.length - 1]} ${parts[0]}`);
  }
  return keys;
}

function cleanDriverName(value) {
  return String(value ?? "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\s*-\s*construction\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NON_PERSON_NAME =
  /^(administration|security|fleet|maintenance(\s+dept)?|dryer\s*\d+|pb\s+packaging|13th\s+street|rr\s*dryers)$/i;
const NOTE_NAME = /old truck|dept\.?$|department|\bpackaging\b|^dryer\b|\bstreet$|\bfleet$/i;

function isPersonDriverName(value) {
  const cleaned = cleanDriverName(value);
  if (!cleaned) return false;
  if (cleaned.includes("/")) return false;
  if (NON_PERSON_NAME.test(normName(cleaned))) return false;
  if (NOTE_NAME.test(cleaned)) return false;
  const parts = normName(cleaned).split(" ").filter(Boolean);
  return parts.length >= 2 && parts.length <= 5;
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

    const people = await sql`
      select
        id::text as id,
        display_name,
        first_name,
        last_name,
        employee_number,
        is_company_driver,
        archived_at is not null as archived
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
    `;

    const byId = new Map(people.map((p) => [p.id, p]));
    const byName = new Map();
    for (const person of people) {
      for (const key of nameKeys(person.display_name)) {
        const list = byName.get(key) ?? [];
        list.push(person);
        byName.set(key, list);
      }
      const firstLast = nameKeys(`${person.first_name ?? ""} ${person.last_name ?? ""}`);
      for (const key of firstLast) {
        const list = byName.get(key) ?? [];
        list.push(person);
        byName.set(key, list);
      }
    }

    const pickPerson = (candidates) => {
      if (!candidates || candidates.length === 0) return null;
      const unique = [...new Map(candidates.map((p) => [p.id, p])).values()];
      const active = unique.filter((p) => !p.archived);
      const pool = active.length > 0 ? active : unique;
      if (pool.length === 1) return pool[0];
      const flagged = pool.filter((p) => p.is_company_driver);
      if (flagged.length === 1) return flagged[0];
      return pool[0] ?? null;
    };

    const matchPerson = (personnelId, name) => {
      if (personnelId && byId.has(personnelId)) return byId.get(personnelId);
      for (const key of nameKeys(name)) {
        const found = pickPerson(byName.get(key));
        if (found) return found;
      }
      return null;
    };

    const drivers = await sql`
      select
        id::text as id,
        personnel_id::text as personnel_id,
        personnel_name,
        status,
        archived_at is not null as archived
      from industrial_fleet_drivers
      where tenant_id = ${tenantId}::uuid
    `;

    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const driverByPersonnel = new Map();
    const driverByName = new Map();
    for (const driver of drivers) {
      if (driver.personnel_id) driverByPersonnel.set(driver.personnel_id, driver);
      const key = normName(driver.personnel_name);
      if (key && !driverByName.has(key)) driverByName.set(key, driver);
    }

    const vehicles = await sql`
      select
        id::text as id,
        asset_number,
        assigned_driver_id::text as assigned_driver_id,
        assigned_driver_personnel_id::text as assigned_driver_personnel_id,
        assigned_driver_name,
        status,
        insured
      from industrial_fleet_vehicles
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
        and (
          nullif(trim(assigned_driver_name), '') is not null
          or assigned_driver_personnel_id is not null
          or assigned_driver_id is not null
        )
    `;

    const assigned = vehicles.filter((v) => !SKIP_VEHICLE_STATUS.has(String(v.status ?? "").toUpperCase()));
    const seenPeople = new Set();
    const seenDriverIds = new Set();
    const seenInsertKeys = new Set();
    const wouldInsert = [];
    const skippedNonPerson = [];
    const wouldFlag = [];
    const wouldLinkVehicle = [];
    const unmatched = [];
    const already = [];

    for (const vehicle of assigned) {
      const existingDriver = vehicle.assigned_driver_id
        ? driverById.get(vehicle.assigned_driver_id)
        : null;
      const rawName = String(vehicle.assigned_driver_name || existingDriver?.personnel_name || "").trim();
      if (rawName && !isPersonDriverName(rawName) && !vehicle.assigned_driver_personnel_id && !existingDriver) {
        skippedNonPerson.push({ vehicleId: vehicle.id, asset: vehicle.asset_number, name: rawName });
        continue;
      }
      const person =
        matchPerson(vehicle.assigned_driver_personnel_id, cleanDriverName(rawName)) ||
        (existingDriver?.personnel_id ? byId.get(existingDriver.personnel_id) : null);
      const name = cleanDriverName(rawName) || String(person?.display_name || existingDriver?.personnel_name || "").trim();
      const existing =
        existingDriver ||
        (person ? driverByPersonnel.get(person.id) : null) ||
        (name ? driverByName.get(normName(name)) : null);

      if (!person && !existing && !name) {
        unmatched.push({ vehicleId: vehicle.id, asset: vehicle.asset_number, reason: "no-name" });
        continue;
      }

      if (existing) {
        already.push({
          vehicleId: vehicle.id,
          asset: vehicle.asset_number,
          driverId: existing.id,
          name: existing.personnel_name || name,
        });
        if (person && !person.is_company_driver && !seenPeople.has(person.id)) {
          seenPeople.add(person.id);
          wouldFlag.push({ personnelId: person.id, name: person.display_name });
        }
        if (person && existing.personnel_id !== person.id && APPLY) {
          await sql`
            update industrial_fleet_drivers
            set personnel_id = ${person.id}::uuid, updated_at = now()
            where id = ${existing.id}::uuid and tenant_id = ${tenantId}::uuid
          `;
        }
        if (
          (!vehicle.assigned_driver_id || vehicle.assigned_driver_id !== existing.id) &&
          !seenDriverIds.has(`link:${vehicle.id}`)
        ) {
          seenDriverIds.add(`link:${vehicle.id}`);
          wouldLinkVehicle.push({ vehicleId: vehicle.id, driverId: existing.id, asset: vehicle.asset_number });
        }
        if (APPLY && (!vehicle.assigned_driver_id || vehicle.assigned_driver_id !== existing.id)) {
          await sql`
            update industrial_fleet_vehicles
            set assigned_driver_id = ${existing.id}::uuid, updated_at = now()
            where id = ${vehicle.id}::uuid and tenant_id = ${tenantId}::uuid
          `;
        }
        continue;
      }

      const insertKey = person?.id || normName(name);
      if (insertKey && seenInsertKeys.has(insertKey)) {
        const prior = wouldInsert.find((row) => (row.personnelId || normName(row.name)) === insertKey);
        if (APPLY && prior?.driverId) {
          await sql`
            update industrial_fleet_vehicles
            set assigned_driver_id = ${prior.driverId}::uuid, updated_at = now()
            where id = ${vehicle.id}::uuid and tenant_id = ${tenantId}::uuid
          `;
        }
        continue;
      }
      if (insertKey) seenInsertKeys.add(insertKey);

      const status = vehicle.insured === true ? "on_insurance" : "pending_mvr";
      const insert = {
        name: name || person?.display_name || "Assigned driver",
        personnelId: person?.id ?? null,
        employeeNumber: person?.employee_number ?? null,
        status,
        asset: vehicle.asset_number,
        vehicleId: vehicle.id,
      };
      wouldInsert.push(insert);
      if (person && !person.is_company_driver && !seenPeople.has(person.id)) {
        seenPeople.add(person.id);
        wouldFlag.push({ personnelId: person.id, name: person.display_name });
      }

      if (APPLY) {
        const id = randomUUID();
        await sql`
          insert into industrial_fleet_drivers (
            id, tenant_id, personnel_id, personnel_name, employee_number, status,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid,
            ${person ? person.id : null}::uuid,
            ${insert.name},
            ${insert.employeeNumber},
            ${status},
            'FORGE',
            'fleetAssignedDrivers',
            ${person?.id || `vehicle:${vehicle.id}`},
            ${sql.json({
              status,
              seededFrom: "fleet_vehicle_assignment",
              personnelName: insert.name,
              vehicleId: vehicle.id,
            })},
            now(), now()
          )
        `;
        await sql`
          update industrial_fleet_vehicles
          set assigned_driver_id = ${id}::uuid, updated_at = now()
          where id = ${vehicle.id}::uuid and tenant_id = ${tenantId}::uuid
        `;
        driverById.set(id, { id, personnel_id: person?.id ?? null, personnel_name: insert.name });
        if (person) driverByPersonnel.set(person.id, { id, personnel_id: person.id });
        if (name)         driverByName.set(normName(name), { id, personnel_name: name });
        insert.driverId = id;
      }
    }

    const flagIds = wouldFlag.map((row) => row.personnelId);
    if (APPLY && flagIds.length > 0) {
      for (const personnelId of flagIds) {
        await sql`
          update industrial_personnel
          set is_company_driver = true, updated_at = now()
          where id = ${personnelId}::uuid and tenant_id = ${tenantId}::uuid
        `;
      }
    }

    const [counts] = await sql`
      select
        (select count(*)::int from industrial_fleet_drivers
          where tenant_id = ${tenantId}::uuid and archived_at is null) as company_drivers,
        (select count(*)::int from industrial_personnel
          where tenant_id = ${tenantId}::uuid and is_company_driver = true) as flagged_people
    `;

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          apply: APPLY,
          vehiclesWithDriver: assigned.length,
          alreadyOnRoster: already.length,
          alreadySamples: already.slice(0, 12),
          wouldInsert,
          wouldFlagPersonnel: wouldFlag,
          wouldLinkVehicle: wouldLinkVehicle.length,
          unmatched,
          skippedNonPerson: skippedNonPerson.length,
          skippedNonPersonSamples: skippedNonPerson.slice(0, 15),
          counts,
          note: APPLY
            ? "Added fleet-assigned drivers to Company Drivers."
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
