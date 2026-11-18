#!/usr/bin/env node
/**
 * Guarded destroy entrypoint.
 * Production / GovCloud destroys require FORGE_CONFIRM_DESTROY=YES and matching FORGE_ENV.
 */
const envName = process.env.FORGE_ENV || "development";
const confirm = process.env.FORGE_CONFIRM_DESTROY;

const protectedEnvs = new Set([
  "production",
  "staging",
  "govcloud-development",
  "govcloud-staging",
  "govcloud-production",
]);

if (protectedEnvs.has(envName) && confirm !== "YES") {
  console.error(
    `Refusing to destroy FORGE_ENV=${envName}. Set FORGE_CONFIRM_DESTROY=YES to proceed.`,
  );
  process.exit(1);
}

if (envName === "development" && confirm !== "YES") {
  console.error("Development destroy still requires FORGE_CONFIRM_DESTROY=YES to avoid accidents.");
  process.exit(1);
}

const { spawnSync } = await import("node:child_process");
const result = spawnSync("npx", ["cdk", "destroy", "--all", "--force"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
