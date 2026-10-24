#!/usr/bin/env node
/**
 * Config Platform RLS spot-check via ECS one-off (forge_app role).
 * Usage: node scripts/config-rls-verify.mjs
 */
import { spawnSync } from "node:child_process";
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

// NOTE: keep as String.raw / escaped ${ so outer Node does not interpolate.
const script2 = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { createDatabase, createId, withTenantTransaction } from "@forge/database";

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const out = { ok: false };

try {
  const who = [...(await db.execute(sql\`select current_user as u\`))][0];
  out.currentUser = who?.u ?? null;

  const rls = [...(await db.execute(sql\`
    select c.relname as t, c.relrowsecurity as rs, c.relforcerowsecurity as fr
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname in ('config_objects','config_versions')
    order by 1
  \`))];
  out.relForce = Object.fromEntries(rls.map(r => [r.t, { rs: !!r.rs, force: !!r.fr }]));

  const tenantA = '019f9e06-a0b2-75f4-9e0b-5ae9befd8193';
  const tenantB = '019fa5c5-6bd9-734c-ace5-76e0b8da28a0';
  out.tenantA = tenantA;
  out.tenantB = tenantB;

  const idsA = await withTenantTransaction(db, tenantA, async (tx) =>
    [...(await tx.execute(sql\`select id::text as id from config_objects\`))].map(r => r.id),
  );
  out.countA = idsA.length;

  const leaked = await withTenantTransaction(db, tenantB, async (tx) => {
    const all = [...(await tx.execute(sql\`select id::text as id, tenant_id::text as tid from config_objects\`))];
    return all.filter(r => idsA.includes(r.id) || r.tid === tenantA);
  });
  out.leaked = leaked;

  let writeBlocked = false;
  let writeErr = null;
  try {
    await withTenantTransaction(db, tenantB, async (tx) => {
      const id = createId();
      await tx.execute(sql\`
        insert into config_objects (id, tenant_id, namespace, object_key, display_name, created_at, updated_at)
        values (\${id}::uuid, \${tenantA}::uuid, 'branding', 'rls-probe', 'probe', now(), now())
      \`);
    });
  } catch (e) {
    writeBlocked = true;
    writeErr = e instanceof Error ? e.message : String(e);
  }
  out.crossTenantInsertBlocked = writeBlocked;
  out.crossTenantInsertError = writeErr;

  if (!writeBlocked) {
    await withTenantTransaction(db, tenantA, async (tx) => {
      await tx.execute(sql\`delete from config_objects where object_key = 'rls-probe'\`);
    });
    out.unexpectedInsert = true;
  }

  const verLeak = await withTenantTransaction(db, tenantB, async (tx) =>
    [...(await tx.execute(sql\`select count(*)::int as c from config_versions where tenant_id = \${tenantA}::uuid\`))][0]?.c ?? 0,
  );
  out.crossTenantVersionCount = verLeak;

  out.ok =
    out.currentUser === 'forge_app' &&
    !!out.relForce?.config_objects?.force &&
    !!out.relForce?.config_versions?.force &&
    leaked.length === 0 &&
    verLeak === 0 &&
    writeBlocked === true &&
    !out.unexpectedInsert;

  console.info(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), partial: out }));
  process.exit(1);
}
`;

if (script2.length >= 6000) {
  console.error(JSON.stringify({ ok: false, error: `inline script too long: ${script2.length}` }));
  process.exit(1);
}

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script2],
  "config-rls-verify",
);

console.log(JSON.stringify({ cluster, taskArn, inlineChars: script2.length, action: "waiting" }));

const wait = spawnSync(
  "aws",
  ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn],
  { encoding: "utf8", shell: true, stdio: "inherit" },
);
if (wait.status !== 0) process.exit(wait.status ?? 1);

const desc = spawnSync(
  "aws",
  [
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
    "--query",
    "tasks[0].containers[0].{exitCode:exitCode,reason:reason}",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
console.log(desc.stdout);

const logs = spawnSync(
  "aws",
  ["logs", "tail", "/forge/development/ecs/platform-api", "--since", "5m", "--format", "short"],
  { encoding: "utf8", shell: true, env: process.env },
);
if (logs.stdout) {
  const lines = logs.stdout.split("\n").filter((l) => l.includes("relForce") || l.includes('"ok"'));
  console.log(lines.slice(-20).join("\n"));
}

const parsed = JSON.parse(desc.stdout || "{}");
process.exit(parsed.exitCode === 0 ? 0 : (parsed.exitCode ?? 1));
