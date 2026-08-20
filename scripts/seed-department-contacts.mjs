/**
 * Map department contacts for producers-rice-mill from personnel supervisor/role hints.
 *
 * Dry-run unless APPLY=1.
 * Runs inside platform-api ECS image (uses /app postgres dependency).
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

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}`);
}

function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scorePersonForDept(person, deptName) {
  const dept = normalize(deptName);
  const hay = normalize(
    [person.display_name, person.supervisor_name, person.position_name, person.department_name].join(
      " ",
    ),
  );
  let score = 0;
  if (person.department_name && normalize(person.department_name) === dept) score += 5;
  for (const token of dept.split(" ").filter((t) => t.length > 2)) {
    if (hay.includes(token)) score += 1;
  }
  const roleHint = normalize(person.position_name || "");
  if (/(manager|supervisor|lead|superintendent)/.test(roleHint)) score += 3;
  if (/(manager|supervisor|lead)/.test(normalize(person.display_name))) score += 1;
  return score;
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const depts = await sql`
      select id::text as id, name, contact_personnel_id::text as contact_personnel_id, contact_name
      from industrial_departments
      where tenant_id = ${tenant.id}::uuid and archived_at is null
      order by name
    `;
    const people = await sql`
      select p.id::text as id, p.display_name, p.email, p.company_email, p.supervisor_name,
             d.name as department_name, pos.name as position_name
      from industrial_personnel p
      left join industrial_departments d on d.id = p.department_id
      left join industrial_positions pos on pos.id = p.position_id
      where p.tenant_id = ${tenant.id}::uuid and p.archived_at is null
        and coalesce(p.status, 'ACTIVE') not in ('TERMINATED', 'INACTIVE', 'ARCHIVED')
    `;

    const proposals = [];
    for (const dept of depts) {
      if (dept.contact_personnel_id) {
        proposals.push({
          departmentId: dept.id,
          departmentName: dept.name,
          action: "skip",
          reason: `already set: ${dept.contact_name || dept.contact_personnel_id}`,
        });
        continue;
      }
      const ranked = people
        .map((p) => ({ person: p, score: scorePersonForDept(p, dept.name) }))
        .filter((r) => r.score >= 5)
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best) {
        proposals.push({
          departmentId: dept.id,
          departmentName: dept.name,
          action: "gap",
          reason: "no confident match",
        });
        continue;
      }
      proposals.push({
        departmentId: dept.id,
        departmentName: dept.name,
        action: "set",
        score: best.score,
        contactPersonnelId: best.person.id,
        contactName: best.person.display_name,
        contactEmail: best.person.email || best.person.company_email || null,
      });
    }

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          apply: APPLY,
          fingerprint: createHash("sha1").update(JSON.stringify(proposals)).digest("hex").slice(0, 12),
          proposals,
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.error("Dry-run only. Re-run with APPLY=1 to write contacts.");
      return;
    }

    let updated = 0;
    for (const row of proposals) {
      if (row.action !== "set") continue;
      await sql`
        update industrial_departments
        set contact_personnel_id = ${row.contactPersonnelId}::uuid,
            contact_name = ${row.contactName},
            contact_email = ${row.contactEmail},
            updated_at = now()
        where id = ${row.departmentId}::uuid
          and tenant_id = ${tenant.id}::uuid
          and contact_personnel_id is null
      `;
      updated += 1;
    }
    console.error(`Updated ${updated} department contacts`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
