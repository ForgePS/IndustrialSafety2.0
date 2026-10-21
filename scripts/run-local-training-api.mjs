#!/usr/bin/env node
/**
 * Start platform-api for local training UAT (port 4000, local CORS).
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";

const build = spawn("pnpm", ["--filter", "@forge/platform-api", "build"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});

build.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const api = spawn("node", ["apps/platform-api/dist/main.js"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      APP_ENV: "local",
      PORT: "4000",
      DATABASE_URL: databaseUrl,
    },
  });
  api.on("exit", (apiCode) => process.exit(apiCode ?? 0));
});
