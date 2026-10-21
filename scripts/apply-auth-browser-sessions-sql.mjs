#!/usr/bin/env node
/**
 * Apply auth_browser_sessions DDL on development Aurora without running the full
 * Drizzle chain (dev ledger has historical gaps before 0096).
 *
 * Usage (local wrapper):
 *   node scripts/run-ecs-apply-auth-browser-sessions.mjs
 *
 * Container entry (invoked by the wrapper):
 *   DATABASE_SECRET_ARN=... node scripts/apply-auth-browser-sessions-sql.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const sqlPath = join(
  repoRoot,
  "packages/database/drizzle/0105_auth_browser_sessions_s1.sql",
);

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) {
  console.error("DATABASE_SECRET_ARN is required");
  process.exit(1);
}
if (secretArn.includes("database-app")) {
  console.error("Refusing app secret — use admin database secret");
  process.exit(1);
}

const client = new SecretsManagerClient({});
const secret = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
const raw = secret.SecretString;
if (!raw) {
  console.error("Secret has no SecretString");
  process.exit(1);
}
const parsed = JSON.parse(raw);
const host = parsed.host ?? parsed.hostname;
const port = Number(parsed.port ?? 5432);
const user = parsed.username ?? parsed.user;
const password = parsed.password;
const database = parsed.dbname ?? parsed.database ?? "forge_platform";
if (!host || !user || !password) {
  console.error("Secret missing host/username/password");
  process.exit(1);
}

const sqlText = readFileSync(sqlPath, "utf8");
const sql = postgres({
  host,
  port,
  user,
  password,
  database,
  ssl: "require",
  max: 1,
});

try {
  await sql.unsafe(sqlText);
  console.log("Applied 0105_auth_browser_sessions_s1.sql");
  const rows = await sql`
    SELECT to_regclass('public.auth_browser_sessions') AS table_name
  `;
  console.log("auth_browser_sessions=", rows[0]?.table_name ?? null);
} finally {
  await sql.end({ timeout: 5 });
}
