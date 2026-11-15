/**
 * ECS one-off: given ACCESS_TOKEN, verify JWT with task Cognito env and walk identity/user SQL.
 * Env: ACCESS_TOKEN, DATABASE_SECRET_ARN (or DATABASE_URL), COGNITO_* from task.
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

const token = (process.env.ACCESS_TOKEN || "").trim();
const report = {
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || null,
  cognitoClientIdPrefix: (process.env.COGNITO_CLIENT_ID || "").slice(0, 48),
  steps: [],
};

if (!token) {
  console.log(JSON.stringify({ ok: false, error: "ACCESS_TOKEN required" }, null, 2));
  process.exit(1);
}

const { verifyCognitoAccessToken } = await import(
  pathToFileURL("/app/apps/platform-api/node_modules/@forge/auth/dist/index.js").href
);

let claims;
try {
  claims = await verifyCognitoAccessToken(token, {
    region: process.env.AWS_REGION || "us-east-1",
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
  });
  report.steps.push({
    step: "verify",
    ok: true,
    sub: claims.sub,
    client_id: claims.client_id,
    iat: claims.iat,
  });
} catch (e) {
  report.steps.push({ step: "verify", ok: false, error: String(e?.message || e) });
  console.log(JSON.stringify({ ok: false, report }, null, 2));
  process.exit(0);
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
const databaseUrl =
  process.env.DATABASE_URL?.trim() || (adminArn ? await resolveDatabaseUrl(adminArn) : "");
if (!databaseUrl) {
  report.steps.push({ step: "db", ok: false, error: "no DATABASE_URL/SECRET" });
  console.log(JSON.stringify({ ok: false, report }, null, 2));
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const lookup = await sql`select * from forge_lookup_identity('COGNITO', ${claims.sub})`;
  const row = lookup[0];
  report.steps.push({
    step: "lookupIdentity",
    ok: Boolean(row),
    row: row
      ? {
          user_id: row.user_id,
          tenant_id: row.tenant_id,
          user_status: row.user_status,
          session_version: row.session_version,
          sessions_revoked_at: row.sessions_revoked_at,
        }
      : null,
  });

  if (row) {
    const tokenIssuedAtMs = typeof claims.iat === "number" ? claims.iat * 1000 : null;
    const revokedAt = row.sessions_revoked_at ? new Date(row.sessions_revoked_at).getTime() : null;
    const revoked = revokedAt != null && tokenIssuedAtMs != null && tokenIssuedAtMs < revokedAt;
    report.steps.push({
      step: "revokeCheck",
      ok: !revoked,
      tokenIssuedAtMs,
      revokedAt,
      revoked,
    });

    const users = await sql`
      select id::text, status, tenant_id::text, session_version, sessions_revoked_at
      from users where id = ${row.user_id}::uuid
    `;
    report.steps.push({ step: "usersRow", ok: users.length > 0, user: users[0] || null });

    const memberships = await sql`
      select m.id::text, t.tenant_key, m.status, m.is_default_tenant
      from user_tenant_memberships m
      join tenants t on t.id = m.tenant_id
      where m.user_id = ${row.user_id}::uuid
    `;
    report.steps.push({
      step: "memberships",
      ok: true,
      count: memberships.length,
      defaults: memberships.filter((m) => m.is_default_tenant).map((m) => m.tenant_key),
      memberships,
    });
  }
} catch (e) {
  report.steps.push({
    step: "sql",
    ok: false,
    error: String(e?.message || e),
    stack: String(e?.stack || "")
      .split("\n")
      .slice(0, 6),
  });
} finally {
  await sql.end({ timeout: 5 });
}

console.log(
  JSON.stringify(
    { ok: report.steps.every((s) => s.ok !== false), phase: "DIAG-AUTH-PRINCIPAL-STEPS", report },
    null,
    2,
  ),
);
