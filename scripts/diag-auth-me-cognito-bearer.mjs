#!/usr/bin/env node
/**
 * ONE-OFF ECS diagnostic: Cognito AccessToken vs api-dev /auth/me + identity link.
 * Env: ACCESS_TOKEN, TARGET_EMAIL, EXPECTED_SUB, TARGET_CLIENT_ID, FORGE_API_BASE, DATABASE_SECRET_ARN
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";

const apiRequire = createRequire("/app/apps/platform-api/package.json");

const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || "").trim();
const TARGET_EMAIL = (process.env.TARGET_EMAIL || "admin@forgepublicsafety.com").trim().toLowerCase();
const EXPECTED_SUB = (process.env.EXPECTED_SUB || "e498c4d8-f091-7083-0ac4-ad145fe79b39").trim();
const TARGET_CLIENT_ID = (process.env.TARGET_CLIENT_ID || "3rls9835j4qs3jmchb3uh7ketm").trim();
const API_BASE = (process.env.FORGE_API_BASE || "https://api-dev.forgepublicsafety.com").replace(/\/$/, "");
const REGION = process.env.AWS_REGION || "us-east-1";
const USER_POOL_ID = (process.env.COGNITO_USER_POOL_ID || "").trim();
const CLIENT_ALLOWLIST = (process.env.COGNITO_CLIENT_ID || "").trim();

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("JWT missing payload segment");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function pickClaims(payload) {
  return {
    token_use: payload.token_use ?? null,
    client_id: payload.client_id ?? null,
    aud: payload.aud ?? null,
    iss: payload.iss ?? null,
    sub: payload.sub ?? null,
    iat: payload.iat ?? null,
    exp: payload.exp ?? null,
  };
}

function assertClientAllowlist(claims, clientIdCsv) {
  const audience = claims.client_id ?? claims.aud;
  const audiences = Array.isArray(audience) ? audience : audience ? [audience] : [];
  const allowed = clientIdCsv.split(",").map((c) => c.trim()).filter(Boolean);
  if (!allowed.some((id) => audiences.includes(id))) {
    throw new Error("Token audience/client mismatch (token=" + (audiences.join("|") || "none") + " allowlist=" + (allowed.join(",") || "empty") + ")");
  }
  if (claims.token_use && claims.token_use !== "access" && claims.token_use !== "id") {
    throw new Error("Unexpected token_use=" + claims.token_use);
  }
  if (!claims.sub) throw new Error("Token missing subject");
}

async function verifyLikeApiDev(token) {
  if (!USER_POOL_ID) return { ok: false, message: "COGNITO_USER_POOL_ID missing in task env" };
  if (!CLIENT_ALLOWLIST) return { ok: false, message: "COGNITO_CLIENT_ID missing in task env" };
  const issuer = "https://cognito-idp." + REGION + ".amazonaws.com/" + USER_POOL_ID;
  const jwks = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"));
  const allowlist = CLIENT_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, clockTolerance: 5 });
    assertClientAllowlist(payload, CLIENT_ALLOWLIST);
    return { ok: true, message: "verifyCognitoAccessToken-equivalent SUCCEEDED (jose + pool issuer + client allowlist)", allowlist, targetClientInAllowlist: allowlist.includes(TARGET_CLIENT_ID) };
  } catch (err) {
    return { ok: false, message: "verify FAILED: " + (err && err.message ? err.message : String(err)), allowlist, targetClientInAllowlist: allowlist.includes(TARGET_CLIENT_ID) };
  }
}

async function callAuthMe(token) {
  const res = await fetch(API_BASE + "/api/v1/auth/me", { headers: { Accept: "application/json", Authorization: "Bearer " + token } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
  return { status: res.status, body };
}

async function identityLookup(sub) {
  const adminArn = process.env.DATABASE_SECRET_ARN && process.env.DATABASE_SECRET_ARN.trim();
  if (!adminArn) return { skipped: true, reason: "DATABASE_SECRET_ARN not set" };
  const { SecretsManagerClient, GetSecretValueCommand } = apiRequire("@aws-sdk/client-secrets-manager");
  const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
  const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
  const postgres = postgresMod.default ?? postgresMod;
  const sm = new SecretsManagerClient({ region: REGION });
  const secretRes = await sm.send(new GetSecretValueCommand({ SecretId: adminArn }));
  const raw = JSON.parse(secretRes.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  const url = "postgresql://" + encodeURIComponent(raw.username) + ":" + encodeURIComponent(raw.password) + "@" + host + ":" + port + "/" + dbname;
  const sql = postgres(url, { max: 1 });
  try {
    const bySubject = await sql
      select ai.id::text as identity_id, ai.user_id::text as user_id, ai.tenant_id::text as tenant_id,
             ai.provider, ai.provider_subject, ai.email_at_link_time,
             u.primary_email, u.status as user_status, u.sessions_revoked_at
      from authentication_identities ai
      join users u on u.id = ai.user_id
      where ai.provider = 'COGNITO' and ai.provider_subject = 
    ;
    const lookup = await sqlselect * from forge_lookup_identity('COGNITO', );
    const usersByEmail = await sql
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users where lower(primary_email) = 
    ;
    return { skipped: false, bySubject, lookupIdentity: lookup, usersByEmail };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.log(JSON.stringify({ ok: false, error: "ACCESS_TOKEN required" }, null, 2));
    process.exit(2);
  }
  const claims = pickClaims(decodeJwtPayload(ACCESS_TOKEN));
  const jwtVerifyResult = await verifyLikeApiDev(ACCESS_TOKEN);
  const authMe = await callAuthMe(ACCESS_TOKEN);
  let identity = { skipped: true, reason: "not attempted" };
  try { identity = await identityLookup(claims.sub || EXPECTED_SUB); }
  catch (err) { identity = { skipped: false, error: String(err && err.message ? err.message : err) }; }
  const out = {
    ok: jwtVerifyResult.ok === true && authMe.status === 200,
    phase: "DIAG-AUTH-ME-COGNITO-BEARER",
    at: new Date().toISOString(),
    target: { email: TARGET_EMAIL, expectedSub: EXPECTED_SUB, targetClientId: TARGET_CLIENT_ID, apiBase: API_BASE, userPoolId: USER_POOL_ID || null },
    jwtClaims: claims,
    subMatchesExpected: claims.sub === EXPECTED_SUB,
    clientIdMatchesTarget: claims.client_id === TARGET_CLIENT_ID,
    jwtVerify: jwtVerifyResult,
    authMe: { status: authMe.status, body: authMe.body },
    identityLookup: identity,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.stack ? err.stack : err) }));
  process.exit(1);
});
