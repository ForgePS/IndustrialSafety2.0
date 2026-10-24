#!/usr/bin/env node
/**
 * Phase 2 closeout: Aurora RLS spot-check via ECS one-off (inline script <6k).
 *
 * Usage: node scripts/phase2-verify-rls.mjs
 */
import { spawnSync } from "node:child_process";
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { eq, sql } from "drizzle-orm";
import { createDatabase, createId, nerisIncidents, tenants, withTenantTransaction } from "@forge/database";

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const out = { ok: false };

try {
  const who = [...(await db.execute(sql\`select current_user as u, session_user as s\`))][0];
  out.currentUser = who?.u ?? null;
  out.sessionUser = who?.s ?? null;
  try {
    out.databaseUrlUser = decodeURIComponent(new URL(env.DATABASE_URL.replace(/^postgresql:/i, "http:")).username || "");
  } catch { out.databaseUrlUser = null; }

  const rlsRows = [...(await db.execute(sql\`
    select c.relname as t, c.relrowsecurity as rs, c.relforcerowsecurity as fr
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('neris_incidents','rms_stations') order by 1
  \`))];
  out.relForceRowSecurity = Object.fromEntries(rlsRows.map((r) => [r.t, { rowSecurity: !!r.rs, forceRls: !!r.fr }]));

  const fakeTenantId = createId();
  out.fakeTenantIncidentCount = await withTenantTransaction(db, fakeTenantId, async (tx) =>
    (await tx.select({ id: nerisIncidents.id }).from(nerisIncidents)).length,
  );

  const syntheticId = "019f9e06-a0b2-75f4-9e0b-5ae9befd8193";
  const otherTenantId = "019fa017-c632-74ae-b70b-672711c72f20";

  const syntheticIds = await withTenantTransaction(db, syntheticId, async (tx) =>
    (await tx.select({ id: nerisIncidents.id }).from(nerisIncidents).limit(50)).map((r) => r.id),
  );
  out.syntheticIncidentCount = syntheticIds.length;
  out.syntheticSampleIds = syntheticIds.slice(0, 5);

  const leaked = await withTenantTransaction(db, otherTenantId, async (tx) =>
    (await tx.select({ id: nerisIncidents.id }).from(nerisIncidents))
      .filter((r) => syntheticIds.includes(r.id))
      .map((r) => r.id),
  );
  out.otherTenantCanSeeSyntheticIds = leaked;
  out.ok =
    out.currentUser === "forge_app" &&
    out.fakeTenantIncidentCount === 0 &&
    !!out.relForceRowSecurity?.neris_incidents?.forceRls &&
    !!out.relForceRowSecurity?.rms_stations?.forceRls &&
    leaked.length === 0 &&
    syntheticIds.length > 0;


  console.info(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), partial: out }));
  process.exit(1);
}
`;

if (script.length >= 6000) {
  console.error(JSON.stringify({ ok: false, error: `inline script too long: ${script.length}` }));
  process.exit(1);
}

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "phase2-verify-rls",
);

console.log(JSON.stringify({ cluster, taskArn, inlineChars: script.length, action: "waiting" }));

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
const parsed = JSON.parse(desc.stdout || "{}");
if (parsed.exitCode !== 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "RLS verify task failed — check CloudWatch logs for platform-api",
      exitCode: parsed.exitCode,
      reason: parsed.reason ?? null,
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    note: "Task exited 0; JSON details are in CloudWatch platform-api logs",
  }),
);
