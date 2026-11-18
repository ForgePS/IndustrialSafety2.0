#!/usr/bin/env node
/**
 * Fix Field silent logout: CloudFront /api proxy + same-origin SPA bake.
 *
 * Root cause: Field was calling a cross-origin API host while session cookies are
 * __Host- + SameSite=Strict. Refresh cannot send the cookie → every remount/click
 * clears auth. Production Field also lacked the /api/* CF behavior (HTML SPA shell).
 *
 * Usage:
 *   node scripts/deploy-field-same-origin-session.mjs
 *   node scripts/deploy-field-same-origin-session.mjs --env development
 *   node scripts/deploy-field-same-origin-session.mjs --env production
 *   node scripts/deploy-field-same-origin-session.mjs --skip-cdk
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipCdk = args.has("--skip-cdk");
const envArg = [...args].find((a) => a.startsWith("--env="))?.slice("--env=".length);
const envs = envArg
  ? [envArg]
  : args.has("--env")
    ? [process.argv[process.argv.indexOf("--env") + 1]].filter(Boolean)
    : ["development", "production"];

function sh(command, opts = {}) {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
}

const cognitoByEnv = {
  development: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    NEXT_PUBLIC_COGNITO_DOMAIN: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  },
  production: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID:
      process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "us-east-1_mJqpAW5qg",
    NEXT_PUBLIC_COGNITO_CLIENT_ID:
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "7vq5mid0et267n7e2thg2b0kkr",
    NEXT_PUBLIC_COGNITO_DOMAIN:
      process.env.NEXT_PUBLIC_COGNITO_DOMAIN ||
      "forge-production-547817.auth.us-east-1.amazoncognito.com",
  },
};

const appUrlByEnv = {
  development: process.env.NEXT_PUBLIC_APP_URL || "https://dr716wyn2h1dm.cloudfront.net",
  production: process.env.FORGE_FIELD_PROD_APP_URL || "https://d2qv0f0hojgvqo.cloudfront.net",
};

for (const environment of envs) {
  console.log(`\n=== Field same-origin session fix (${environment}) ===`);

  if (!skipCdk) {
    sh(
      `pnpm --filter @forge/infrastructure-cdk exec cdk deploy ForgeFieldFrontend --app "tsx bin/deploy-field.ts" --require-approval never`,
      {
        cwd: path.join(repoRoot, "infrastructure/cdk"),
        env: {
          FORGE_ENV: environment,
          FORGE_ENVIRONMENT: environment,
          FORGE_PRODUCTION_ACCOUNT: process.env.FORGE_PRODUCTION_ACCOUNT || "511343547817",
        },
      },
    );
  }

  const cognito = cognitoByEnv[environment] || {};
  sh(`node scripts/sync-static-site.mjs --app field --full-invalidate`, {
    env: {
      FORGE_ENVIRONMENT: environment,
      FORGE_SAME_ORIGIN_API: "1",
      NEXT_PUBLIC_API_URL: "",
      NEXT_PUBLIC_APP_URL: appUrlByEnv[environment],
      ...Object.fromEntries(Object.entries(cognito).filter(([, v]) => Boolean(v))),
    },
  });
}

console.log("\nField same-origin session deploy complete.");
