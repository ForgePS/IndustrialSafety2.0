#!/usr/bin/env node
/**
 * One-shot local training UAT bootstrap:
 * 1) resolves first local tenant
 * 2) runs demo + UAT seeds
 * 3) verifies seeded rows
 *
 * Prereqs: docker postgres up, pnpm db:migrate, pnpm db:seed
 *
 * Usage: node scripts/run-local-training-uat.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";

function psqlScalar(query) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "forge-platform-postgres",
      "psql",
      "-U",
      "forge",
      "-d",
      "forge_platform_local",
      "-t",
      "-A",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return (result.stdout ?? "").trim();
}

function runNode(script, env) {
  const result = spawnSync("node", [script], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    shell: true,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status}`);
  }
  const match = (result.stdout ?? "").match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

function main() {
  const tenantId = psqlScalar("select id::text from tenants order by created_at limit 1;");
  if (!tenantId) throw new Error("No tenant found — run pnpm db:seed first");

  const env = {
    ...process.env,
    DATABASE_URL,
    FORGE_TRAINING_SEED_TENANT_ID: tenantId,
    FORGE_TRAINING_UAT_APP_BASE_URL: process.env.FORGE_TRAINING_UAT_APP_BASE_URL ?? "http://localhost:3004",
  };

  console.log(`Using tenant ${tenantId}`);
  runNode("scripts/seed-industrial-training-demo.mjs", env);
  const uat = runNode("scripts/seed-industrial-training-uat.mjs", env);
  runNode("scripts/verify-local-training-uat.mjs", env);

  const viewUrl = uat?.viewUrl ?? uat?.localDevUrl ?? uat?.portalUrl ?? null;
  const artifact = {
    tenantId,
    portalUrl: uat?.portalUrl ?? null,
    viewUrl,
    employeeNumber: "10452",
    employeeName: "John Smith",
    assignmentId: uat?.assignmentId ?? null,
    personnelId: uat?.employee?.personnelId ?? null,
    generatedAt: new Date().toISOString(),
  };
  const outPath = join(repoRoot, ".local-training-uat.json");
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log("  Training portal ready");
  console.log(line);
  if (viewUrl) console.log(`\n  Open:  ${viewUrl}`);
  console.log("\n  Or run:  pnpm training:view");
  console.log(`\n${line}`);
  console.log(`\nWrote ${outPath}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
