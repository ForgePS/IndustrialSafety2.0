/**
 * Dev-only API smoke for creator against Tenant A (import-acceptance-tenant-a).
 *
 * User ba491113 lives on home tenant 019f9c33…; Cognito/dev principal tenantHint
 * must be the home tenant so the users row resolves. Tenant A is selected via
 * POST /auth/select-tenant and/or x-tenant-id.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.FORGE_API_BASE ?? "https://d108fstxdv69bo.cloudfront.net";
const userId = "ba491113-ba27-4ee6-8989-2eec1fe285d2";
const HOME_TENANT = "019f9c33-2875-75aa-8d0e-e4bec722565e";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";

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
      body: text.length > 1500 ? `${text.slice(0, 1500)}...` : text,
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

const results = [];
results.push(await call("auth_me_home", "/api/v1/auth/me", { activeTenantId: HOME_TENANT }));
results.push(
  await call("select_tenant_a", "/api/v1/auth/select-tenant", {
    method: "POST",
    activeTenantId: HOME_TENANT,
    body: { tenantId: TENANT_A },
  }),
);
results.push(await call("auth_me_tenant_a", "/api/v1/auth/me", { activeTenantId: TENANT_A }));
results.push(await call("modules", "/api/v1/industrial/modules", { activeTenantId: TENANT_A }));
results.push(await call("bootstrap", "/api/v1/industrial/bootstrap", { activeTenantId: TENANT_A }));
results.push(
  await call("personnel", "/api/v1/industrial/personnel?limit=3", {
    activeTenantId: TENANT_A,
  }),
);
results.push(
  await call("equipment", "/api/v1/industrial/equipment?limit=3", {
    activeTenantId: TENANT_A,
  }),
);
results.push(await call("loto", "/api/v1/industrial/loto?limit=3", { activeTenantId: TENANT_A }));

const ok = results.every((r) => r.status != null && r.status >= 200 && r.status < 300);
const out = {
  ok,
  at: new Date().toISOString(),
  base: BASE,
  userId,
  homeTenantId: HOME_TENANT,
  tenantAId: TENANT_A,
  results,
};
const evidenceDir = path.resolve("docs/program/industrial-migration/ind-11/evidence/wave3");
fs.mkdirSync(evidenceDir, { recursive: true });
const file = path.join(evidenceDir, "api-smoke-tenant-a.json");
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
console.log(`wrote ${file}`);
process.exit(ok ? 0 : 1);
