#!/usr/bin/env node
/**
 * Live Import Platform permission matrix (DEF-S8-007) against development API.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const API = process.env.FORGE_API_BASE_URL || "https://d108fstxdv69bo.cloudfront.net";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const TENANT_B = "019faa15-e578-76bd-b269-038d23c03b5e";
const seed = JSON.parse(
  fs.readFileSync("docs/testing/evidence/import-platform/s8-personas-seed.json", "utf8"),
);
const A = seed["import-acceptance-tenant-a"].personas;
const B = seed["import-acceptance-tenant-b"].personas;

function principal(userId, tenantId) {
  return JSON.stringify({ userId, tenantId });
}
async function call(method, path, userId, tenantId, { body, idempotencyKey } = {}) {
  const headers = {
    Accept: "application/json",
    "X-Forge-Dev-Principal": principal(userId, tenantId),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, code: json?.error?.code ?? null, json };
}

const cases = [];
function rec(name, permission, expected, actual, notes = "") {
  const ok = Array.isArray(expected)
    ? expected.includes(actual.status)
    : actual.status === expected;
  cases.push({
    name,
    permission,
    expected,
    actual: actual.status,
    code: actual.code,
    pass: ok,
    notes,
  });
}

async function main() {
  // Authorized view
  rec(
    "viewer list jobs",
    "import.view",
    200,
    await call("GET", "/api/v1/imports/jobs", A.viewer.userId, TENANT_A),
  );
  // Unauthorized view
  rec(
    "unauthorized list jobs",
    "import.view",
    [401, 403],
    await call("GET", "/api/v1/imports/jobs", A.unauthorized.userId, TENANT_A),
  );
  // Upload deny for viewer
  rec(
    "viewer upload denied",
    "import.upload",
    403,
    await call("POST", "/api/v1/imports/upload", A.viewer.userId, TENANT_A, {
      idempotencyKey: `pm-up-${crypto.randomUUID()}`,
      body: {
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "personnel",
        displayName: "deny",
        fileName: "x.csv",
        contentType: "text/csv",
        byteSize: 10,
        format: "csv",
      },
    }),
  );
  // Approve deny for operator
  const jobs = await call("GET", "/api/v1/imports/jobs?pageSize=1", A.full.userId, TENANT_A);
  const jobId = jobs.json?.data?.items?.[0]?.id;
  if (jobId) {
    rec(
      "viewer mappings update denied",
      "import.map",
      403,
      await call("PUT", `/api/v1/imports/jobs/${jobId}/mappings`, A.viewer.userId, TENANT_A, {
        idempotencyKey: `pm-map-${crypto.randomUUID()}`,
        body: { mappings: [] },
      }),
    );
    rec(
      "viewer validation request denied",
      "import.validate",
      403,
      await call(
        "POST",
        `/api/v1/imports/jobs/${jobId}/request-validation`,
        A.viewer.userId,
        TENANT_A,
        {
          idempotencyKey: `pm-val-${crypto.randomUUID()}`,
          body: {},
        },
      ),
    );
    rec(
      "viewer preview request denied",
      "import.preview",
      403,
      await call(
        "POST",
        `/api/v1/imports/jobs/${jobId}/request-preview`,
        A.viewer.userId,
        TENANT_A,
        {
          idempotencyKey: `pm-prev-${crypto.randomUUID()}`,
          body: {},
        },
      ),
    );
    rec(
      "viewer error retry denied",
      "import.error.reprocess",
      403,
      await call(
        "POST",
        `/api/v1/imports/jobs/${jobId}/errors/${crypto.randomUUID()}/retry`,
        A.viewer.userId,
        TENANT_A,
        { body: {} },
      ),
      "synthetic error id; permission denial must precede resource lookup",
    );
    rec(
      "operator approve denied",
      "import.approve",
      403,
      await call("POST", `/api/v1/imports/jobs/${jobId}/approve`, A.operator.userId, TENANT_A, {
        idempotencyKey: `pm-ap-${crypto.randomUUID()}`,
        body: {},
      }),
    );
    rec(
      "operator execute denied",
      "import.execute",
      403,
      await call("POST", `/api/v1/imports/jobs/${jobId}/execute`, A.operator.userId, TENANT_A, {
        idempotencyKey: `pm-ex-${crypto.randomUUID()}`,
        body: { adapterKey: "reference:generic:record@1" },
      }),
    );
    rec(
      "viewer rollback denied",
      "import.rollback",
      403,
      await call(
        "POST",
        `/api/v1/imports/jobs/${jobId}/rollback-request`,
        A.viewer.userId,
        TENANT_A,
        {
          idempotencyKey: `pm-rb-${crypto.randomUUID()}`,
          body: { reason: "matrix deny" },
        },
      ),
    );
    // Cross-tenant
    rec(
      "tenant B cannot get tenant A job",
      "tenant-scope",
      404,
      await call("GET", `/api/v1/imports/jobs/${jobId}`, B.full.userId, TENANT_B),
    );
  }
  // Profile manage
  rec(
    "viewer profile create denied",
    "import.profile.manage",
    403,
    await call("POST", "/api/v1/imports/profiles", A.viewer.userId, TENANT_A, {
      idempotencyKey: `pm-pr-${crypto.randomUUID()}`,
      body: {
        profileKey: `s8-deny-${crypto.randomUUID().slice(0, 8)}`,
        displayName: "deny",
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "personnel",
      },
    }),
  );
  rec(
    "operator profile create allowed",
    "import.profile.manage",
    [200, 201],
    await call("POST", "/api/v1/imports/profiles", A.operator.userId, TENANT_A, {
      idempotencyKey: `pm-pr2-${crypto.randomUUID()}`,
      body: {
        profileKey: `s8-ok-${crypto.randomUUID().slice(0, 8)}`,
        displayName: "S8 matrix profile",
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "personnel",
      },
    }),
  );
  // Template mutation deny for viewer. This intentionally requires 403 so a missing
  // import.template.manage route is reported as a live coverage failure rather than
  // accepting a route-level 404 as authorization evidence.
  rec(
    "viewer template create denied",
    "import.template.manage",
    403,
    await call("POST", "/api/v1/imports/templates", A.viewer.userId, TENANT_A, {
      idempotencyKey: `pm-tpl-${crypto.randomUUID()}`,
      body: {
        templateKey: `s8-deny-${crypto.randomUUID().slice(0, 8)}`,
        displayName: "deny",
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "personnel",
      },
    }),
    "template mutation must be guarded by import.template.manage",
  );

  // Sensitive download without permission
  if (jobId) {
    rec(
      "viewer privileged download denied",
      "import.sensitive",
      [403, 404, 409],
      await call(
        "POST",
        `/api/v1/imports/jobs/${jobId}/results/download`,
        A.viewer.userId,
        TENANT_A,
        {
          body: { privileged: true },
        },
      ),
      "privileged=true requires import.sensitive",
    );
  }

  const pass = cases.filter((c) => c.pass).length;
  const fail = cases.filter((c) => !c.pass).length;
  const out = {
    ok: fail === 0,
    api: API,
    pass,
    fail,
    cases,
    completedAt: new Date().toISOString(),
  };
  fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
  fs.writeFileSync(
    "docs/testing/evidence/import-platform/s8-permission-matrix-live.json",
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify({ ok: out.ok, pass, fail }, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
