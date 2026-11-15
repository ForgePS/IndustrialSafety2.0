#!/usr/bin/env node
/**
 * One-off: sync industrial-web to production after Inspections title/type UI changes.
 * Avoids PowerShell stderr aborting the pipeline.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Best-effort unlock of Windows .next locks without killing the whole IDE.
for (const rel of ["apps/industrial-web/.next", "apps/industrial-web/out"]) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`Removed ${rel}`);
  } catch (err) {
    console.warn(`Could not remove ${rel}: ${err instanceof Error ? err.message : err}`);
  }
}

delete process.env.AWS_PROFILE;
run(
  "node",
  ["scripts/sync-static-site.mjs", "--app", "industrial", "--environment", "production"],
  {
    env: {
      NODE_ENV: "production",
      NEXT_PRIVATE_WORKER_THREADS: "false",
    },
  },
);

console.log(JSON.stringify({ ok: true, app: "industrial", environment: "production" }, null, 2));
