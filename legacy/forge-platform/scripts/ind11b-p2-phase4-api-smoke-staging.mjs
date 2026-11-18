#!/usr/bin/env node
/**
 * Phase 4 R6 — day-1 module API smoke against producers-rice-mill-staging.
 *
 * Prefer Cognito smoke passwords (~/.forge/producers-p2/); falls back to
 * x-forge-dev-principal (creator) when FORGE_P2_PHASE4_SMOKE_MODE=dev-principal.
 *
 *   FORGE_P2_PHASE4_LOAD_AUTHORIZED=true \
 *     node scripts/ind11b-p2-phase4-api-smoke-staging.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/04-parity");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-PHASE4-LOAD.md");
const STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const HOME_TENANT = "019f9c33-2875-75aa-8d0e-e4bec722565e";
const CREATOR_USER = "ba491113-ba27-4ee6-8989-2eec1fe285d2";
const API = process.env.FORGE_API_BASE || "https://api-dev.forgepublicsafety.com";
const POOL = "us-east-1_VYjUFLXG4";
const CLIENT = "3rls9835j4qs3jmchb3uh7ketm";
const REGION = "us-east-1";

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_PHASE4_LOAD_AUTHORIZED?.trim() !== "true") {
  fail("Refused: set FORGE_P2_PHASE4_LOAD_AUTHORIZED=true");
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("Approval not SIGNED / AUTHORIZED");
  }
}

const forcedMode = process.env.FORGE_P2_PHASE4_SMOKE_MODE?.trim();
const secretDir = path.join(os.homedir(), ".forge", "producers-p2");
let mode = forcedMode || "cognito";
let accessToken = null;
let actor = null;

if (mode === "cognito") {
  try {
    const smokeFiles = fs.existsSync(secretDir)
      ? fs
          .readdirSync(secretDir)
          .filter((f) => f.startsWith("staging-smoke-passwords-") && f.endsWith(".json"))
          .sort()
      : [];
    if (!smokeFiles.length) throw new Error("no smoke password file");
    const secrets = JSON.parse(fs.readFileSync(path.join(secretDir, smokeFiles.at(-1)), "utf8"));
    const email = (
      process.env.FORGE_P2_SMOKE_EMAIL || "safetyadmin@producersrice.com"
    ).toLowerCase();
    const entry = (secrets.passwords || []).find((p) => p.email?.toLowerCase() === email);
    if (!entry?.password) throw new Error(`missing password for ${email}`);

    const require = createRequire(path.resolve("apps/platform-api/package.json"));
    const {
      CognitoIdentityProviderClient,
      AdminInitiateAuthCommand,
      AuthFlowType,
    } = require("@aws-sdk/client-cognito-identity-provider");
    const client = new CognitoIdentityProviderClient({ region: REGION });
    const res = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: POOL,
        ClientId: CLIENT,
        AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
        AuthParameters: { USERNAME: email, PASSWORD: entry.password },
      }),
    );
    accessToken = res.AuthenticationResult?.AccessToken;
    if (!accessToken) throw new Error(`auth challenge=${res.ChallengeName || "none"}`);
    actor = { email, auth: "cognito" };
  } catch (e) {
    if (forcedMode === "cognito") fail(`Cognito smoke failed: ${e.message || e}`);
    mode = "dev-principal";
  }
}

if (mode === "dev-principal") {
  actor = { userId: CREATOR_USER, auth: "x-forge-dev-principal" };
}

function headers(tenantId) {
  const h = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
  };
  if (accessToken) {
    h.Authorization = `Bearer ${accessToken}`;
  } else {
    h["x-forge-dev-principal"] = JSON.stringify({
      userId: CREATOR_USER,
      tenantId: HOME_TENANT,
    });
  }
  return h;
}

async function call(label, p, opts = {}) {
  const tenantId = opts.tenantId ?? STAGING;
  const method = opts.method ?? "GET";
  try {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: headers(tenantId),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    const items = body?.data?.items;
    const total =
      body?.data?.total ?? body?.data?.count ?? (Array.isArray(items) ? items.length : null);
    const sampleTenant =
      items?.[0]?.tenantId ?? body?.data?.tenantId ?? body?.data?.items?.[0]?.tenantId ?? null;
    return {
      label,
      path: p,
      method,
      tenantId,
      status: res.status,
      pass: (opts.expect ?? [200]).includes(res.status),
      total,
      sampleTenant,
      itemCount: Array.isArray(items) ? items.length : null,
      industrialEnabled: body?.data?.industrialEnabled ?? null,
      entitled: body?.data?.entitled ?? null,
    };
  } catch (e) {
    return {
      label,
      path: p,
      method,
      tenantId,
      status: null,
      pass: false,
      error: String(e.message || e),
    };
  }
}

const results = [];

if (mode === "dev-principal") {
  results.push(
    await call("select_staging", "/api/v1/auth/select-tenant", {
      method: "POST",
      tenantId: HOME_TENANT,
      body: { tenantId: STAGING },
      expect: [200, 201],
    }),
  );
}

results.push(await call("auth_me", "/api/v1/auth/me"));
results.push(await call("bootstrap", "/api/v1/industrial/bootstrap"));
results.push(await call("modules", "/api/v1/industrial/modules"));

const listRoutes = [
  ["personnel", "/api/v1/industrial/personnel?limit=5"],
  ["sites", "/api/v1/industrial/sites?limit=5"],
  ["equipment", "/api/v1/industrial/equipment?limit=5"],
  ["loto", "/api/v1/industrial/loto?limit=5"],
  ["training", "/api/v1/industrial/training?limit=5"],
  ["forms", "/api/v1/industrial/forms?limit=5"],
  ["inspections", "/api/v1/industrial/inspections?limit=5"],
  ["incidents", "/api/v1/industrial/incidents?limit=5"],
  ["confined_space", "/api/v1/industrial/confined-space?limit=5"],
  ["hot_work", "/api/v1/industrial/hot-work?limit=5"],
  ["qr_links", "/api/v1/industrial/qr-links?limit=5"],
  ["documents", "/api/v1/industrial/documents?limit=5"],
];

for (const [label, p] of listRoutes) {
  results.push(await call(label, p, { expect: [200, 404] }));
}

// Negative: staging token/principal must not return Tenant A equipment IDs when asking staging.
const equip = results.find((r) => r.label === "equipment");
const isolation = {
  equipmentPass: !!equip?.pass,
  sampleTenantIsStaging: !equip?.sampleTenant || equip.sampleTenant === STAGING,
  notTenantA: equip?.sampleTenant !== TENANT_A,
};

const ok =
  results
    .filter((r) =>
      ["auth_me", "bootstrap", "modules", "personnel", "equipment", "loto"].includes(r.label),
    )
    .every((r) => r.pass) &&
  isolation.sampleTenantIsStaging &&
  isolation.notTenantA;

const out = {
  ok,
  at: new Date().toISOString(),
  phase: "PRODUCERS-P4-R6-api-smoke",
  apiBase: API,
  tenantId: STAGING,
  mode,
  actor,
  isolation,
  results,
};
fs.mkdirSync(EVID_DIR, { recursive: true });
fs.writeFileSync(
  path.join(EVID_DIR, "api-smoke-staging.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(EVID_DIR, "api-smoke-staging-latest.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 1);
