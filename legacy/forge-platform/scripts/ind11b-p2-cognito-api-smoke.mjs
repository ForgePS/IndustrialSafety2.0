#!/usr/bin/env node
/**
 * H4 browser/API follow-up: AdminInitiateAuth with post-force-change passwords,
 * call /auth/me + industrial/bootstrap against staging tenant.
 * Passwords never printed or written to evidence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const POOL = "us-east-1_VYjUFLXG4";
const CLIENT = "3rls9835j4qs3jmchb3uh7ketm";
const REGION = "us-east-1";
const API = process.env.FORGE_API_BASE || "https://api-dev.forgepublicsafety.com";
const STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const PROD_TWIN = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";
const TENANT = process.env.FORGE_P2_SMOKE_TENANT?.trim() || STAGING;
const EVIDENCE_NAME =
  TENANT === PROD_TWIN ? "login-smoke-prod-twin.json" : "login-smoke-staging.json";
const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");
const TARGETS = ["safetyadmin@producersrice.com", "jlackie@producersrice.com"];

const secretDir = path.join(os.homedir(), ".forge", "producers-p2");
const smokeFiles = fs
  .readdirSync(secretDir)
  .filter((f) => f.startsWith("staging-smoke-passwords-") && f.endsWith(".json"))
  .sort();
if (!smokeFiles.length) {
  console.error(
    JSON.stringify({ ok: false, error: "No smoke password file — run force-change first" }),
  );
  process.exit(2);
}
const secrets = JSON.parse(fs.readFileSync(path.join(secretDir, smokeFiles.at(-1)), "utf8"));
const byEmail = new Map((secrets.passwords || []).map((p) => [p.email.toLowerCase(), p]));

const require = createRequire(path.resolve("apps/platform-api/package.json"));
const {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AuthFlowType,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({ region: REGION });

async function tokensFor(email) {
  const entry = byEmail.get(email.toLowerCase());
  if (!entry?.password) throw new Error(`missing smoke password for ${email}`);
  const res = await client.send(
    new AdminInitiateAuthCommand({
      UserPoolId: POOL,
      ClientId: CLIENT,
      AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email, PASSWORD: entry.password },
    }),
  );
  if (!res.AuthenticationResult?.AccessToken) {
    throw new Error(`No access token (challenge=${res.ChallengeName || "none"})`);
  }
  return {
    accessToken: res.AuthenticationResult.AccessToken,
    idToken: res.AuthenticationResult.IdToken,
  };
}

async function apiCall(label, accessToken, p, tenantId) {
  const res = await fetch(`${API}${p}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-tenant-id": tenantId,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    label,
    path: p,
    status: res.status,
    pass: res.status === 200,
    tenantIdFromBody: body?.data?.tenantId ?? null,
    emailHint: body?.data?.userId ? String(body.data.userId).slice(0, 8) : null,
    entitled: body?.data?.entitled ?? body?.data?.activeProducts ?? null,
    product: body?.data?.productCode ?? null,
    industrialEnabled: body?.data?.industrialEnabled ?? null,
  };
}

const results = [];
for (const email of TARGETS) {
  try {
    const { accessToken } = await tokensFor(email);
    const me = await apiCall("auth_me", accessToken, "/api/v1/auth/me", TENANT);
    const boot = await apiCall("bootstrap", accessToken, "/api/v1/industrial/bootstrap", TENANT);
    results.push({
      email,
      ok: me.pass && boot.pass,
      me,
      bootstrap: boot,
    });
  } catch (e) {
    results.push({ email, ok: false, error: e?.name || String(e), message: e?.message });
  }
}

const out = {
  ok: results.every((r) => r.ok),
  at: new Date().toISOString(),
  phase: TENANT === PROD_TWIN ? "PRODUCERS-P2-prod-twin-api-smoke" : "PRODUCERS-P2-H4-api-smoke",
  apiBase: API,
  tenantId: TENANT,
  results,
};
fs.writeFileSync(path.join(EVID, EVIDENCE_NAME), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
