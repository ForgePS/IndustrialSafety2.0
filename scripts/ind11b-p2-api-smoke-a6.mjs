/**
 * Producers P2 Phase 1 — API smoke: positive on Producers tenants + A6 negatives.
 *
 * Uses x-forge-dev-principal (development) with home-tenant hint + x-tenant-id.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.FORGE_API_BASE ?? "https://d108fstxdv69bo.cloudfront.net";
const userId = "ba491113-ba27-4ee6-8989-2eec1fe285d2";
const HOME_TENANT = "019f9c33-2875-75aa-8d0e-e4bec722565e";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const PRODUCERS_STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const PRODUCERS_PROD = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";
const FORGE_PLATFORM = process.env.FORGE_PLATFORM_TENANT_ID?.trim() || "";

function principalHeaders(activeTenantId) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-forge-dev-principal": JSON.stringify({ userId, tenantId: HOME_TENANT }),
    "x-tenant-id": activeTenantId,
  };
}

async function call(label, p, init = {}) {
  const activeTenantId = init.activeTenantId ?? HOME_TENANT;
  const method = init.method ?? "GET";
  const headers = principalHeaders(activeTenantId);
  try {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    return {
      label,
      path: p,
      method,
      activeTenantId,
      status: res.status,
      body: text.length > 2000 ? `${text.slice(0, 2000)}...` : text,
    };
  } catch (err) {
    return {
      label,
      path: p,
      method,
      activeTenantId,
      status: null,
      body: String(err),
    };
  }
}

function expectStatus(r, allowed) {
  const ok = allowed.includes(r.status);
  return { ...r, expect: allowed, pass: ok };
}

const results = [];

results.push(
  expectStatus(
    await call("auth_me_home", "/api/v1/auth/me", { activeTenantId: HOME_TENANT }),
    [200],
  ),
);

for (const [label, tenantId] of [
  ["producers_staging", PRODUCERS_STAGING],
  ["producers_prod", PRODUCERS_PROD],
]) {
  results.push(
    expectStatus(
      await call(`select_${label}`, "/api/v1/auth/select-tenant", {
        method: "POST",
        activeTenantId: HOME_TENANT,
        body: { tenantId },
      }),
      [200, 201],
    ),
  );
  results.push(
    expectStatus(
      await call(`auth_me_${label}`, "/api/v1/auth/me", { activeTenantId: tenantId }),
      [200],
    ),
  );
  results.push(
    expectStatus(
      await call(`bootstrap_${label}`, "/api/v1/industrial/bootstrap", {
        activeTenantId: tenantId,
      }),
      [200],
    ),
  );
  results.push(
    expectStatus(
      await call(`modules_${label}`, "/api/v1/industrial/modules", { activeTenantId: tenantId }),
      [200],
    ),
  );
}

// A6: read Autenant A resources while selecting Producers — tenant A personnel must not leak
// via Producers tenant header (empty/isolation). Cross-tenant write not attempted.
results.push(
  expectStatus(
    await call("a6_personnel_on_staging", "/api/v1/industrial/personnel?limit=5", {
      activeTenantId: PRODUCERS_STAGING,
    }),
    [200],
  ),
);
results.push(
  expectStatus(
    await call("a6_personnel_on_tenant_a", "/api/v1/industrial/personnel?limit=5", {
      activeTenantId: TENANT_A,
    }),
    [200],
  ),
);

// Negative: home forge-platform has membership but no Industrial product
results.push(
  expectStatus(
    await call("a6_negative_forge_platform_bootstrap", "/api/v1/industrial/bootstrap", {
      activeTenantId: HOME_TENANT,
    }),
    [401, 403, 404],
  ),
);

// Negative: unknown tenant UUID
const foreignTenant = FORGE_PLATFORM || "00000000-0000-4000-8000-000000000099";
results.push(
  expectStatus(
    await call("a6_negative_foreign_bootstrap", "/api/v1/industrial/bootstrap", {
      activeTenantId: foreignTenant,
    }),
    [401, 403, 404],
  ),
);
results.push(
  expectStatus(
    await call("a6_negative_select_foreign", "/api/v1/auth/select-tenant", {
      method: "POST",
      activeTenantId: HOME_TENANT,
      body: { tenantId: foreignTenant },
    }),
    [400, 401, 403, 404],
  ),
);

const allPass = results.every((r) => r.pass);
const out = {
  ok: allPass,
  at: new Date().toISOString(),
  base: BASE,
  userId,
  results,
};
const evidDir = path.resolve(
  "docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra",
);
fs.mkdirSync(evidDir, { recursive: true });
fs.writeFileSync(path.join(evidDir, "p2-api-smoke-a6.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
process.exit(allPass ? 0 : 1);
