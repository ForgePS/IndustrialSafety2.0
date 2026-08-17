/**
 * producers-rice-mill only: link industrial_fleet_drivers → industrial_personnel
 * and set is_company_driver for active insurance/MVR roster people.
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-link-company-drivers.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-link-company-drivers.mjs
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

function normName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    const people = await sql`
      select
        id::text as id,
        employee_number,
        display_name,
        is_company_driver,
        archived_at is not null as archived
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
    `;

    const byEmp = new Map();
    const byName = new Map();
    for (const person of people) {
      const emp = String(person.employee_number ?? "").trim().toUpperCase();
      if (emp) {
        const list = byEmp.get(emp) ?? [];
        list.push(person);
        byEmp.set(emp, list);
      }
      const name = normName(person.display_name);
      if (name) {
        const list = byName.get(name) ?? [];
        list.push(person);
        byName.set(name, list);
      }
    }

    const pickPerson = (candidates) => {
      if (!candidates || candidates.length === 0) return null;
      const active = candidates.filter((p) => !p.archived);
      const pool = active.length > 0 ? active : candidates;
      return pool[0] ?? null;
    };

    const drivers = await sql`
      select
        id::text as id,
        personnel_id::text as personnel_id,
        personnel_name,
        status,
        source_payload
      from industrial_fleet_drivers
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    let linked = 0;
    let alreadyLinked = 0;
    let unmatched = 0;
    let flagged = 0;
    const samples = { linked: [], unmatched: [] };

    for (const driver of drivers) {
      const payload = unwrap(driver.source_payload);
      const emp = String(payload.employeeNumber ?? "").trim().toUpperCase();
      const name = normName(driver.personnel_name || payload.personnelName);
      const person =
        pickPerson(emp ? byEmp.get(emp) : null) || pickPerson(name ? byName.get(name) : null);

      if (driver.personnel_id) {
        alreadyLinked += 1;
      } else if (person) {
        linked += 1;
        if (samples.linked.length < 15) {
          samples.linked.push({
            driverId: driver.id,
            personnelId: person.id,
            name: driver.personnel_name,
            emp,
          });
        }
        if (APPLY) {
          await sql`
            update industrial_fleet_drivers
            set personnel_id = ${person.id}::uuid, updated_at = now()
            where id = ${driver.id}::uuid
              and tenant_id = ${tenantId}::uuid
          `;
        }
      } else {
        unmatched += 1;
        if (samples.unmatched.length < 15) {
          samples.unmatched.push({
            driverId: driver.id,
            name: driver.personnel_name,
            emp,
          });
        }
      }

      const targetId = driver.personnel_id || person?.id;
      const status = String(payload.status ?? driver.status ?? "").toLowerCase();
      if (targetId && status !== "removed") {
        const target = people.find((p) => p.id === targetId);
        if (target && !target.is_company_driver) {
          flagged += 1;
          if (APPLY) {
            await sql`
              update industrial_personnel
              set is_company_driver = true, updated_at = now()
              where id = ${targetId}::uuid
                and tenant_id = ${tenantId}::uuid
            `;
          }
        }
      }
    }

    const [after] = APPLY
      ? await sql`
          select
            count(*) filter (where personnel_id is not null)::int as linked_drivers,
            (select count(*)::int from industrial_personnel
              where tenant_id = ${tenantId}::uuid and is_company_driver = true) as flagged_people
          from industrial_fleet_drivers
          where tenant_id = ${tenantId}::uuid and archived_at is null
        `
      : [{ linked_drivers: null, flagged_people: null }];

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          apply: APPLY,
          drivers: drivers.length,
          wouldLink: linked,
          alreadyLinked,
          unmatched,
          wouldFlagPersonnel: flagged,
          after,
          samples,
          ok: true,
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
