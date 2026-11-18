#!/usr/bin/env node
/**
 * Full Configuration Platform authorization matrix against live API.
 * Requires personas seeded via scripts/run-ecs-seed-config-auth.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(__dirname, "..", "docs/testing/evidence/config-final-acceptance");
mkdirSync(evidenceDir, { recursive: true });

const BASE = process.env.FORGE_API_BASE ?? "https://d108fstxdv69bo.cloudfront.net";
const TENANT_A = process.env.FORGE_CONFIG_TENANT_A ?? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193";
const PLATFORM_USER = "019f9c33-288e-7171-8d94-b76c4a4658b6";
const PLATFORM_TENANT = "019f9c33-2875-75aa-8d0e-e4bec722565e";

const personaFile = path.join(evidenceDir, "seeded-auth-personas.json");
if (!existsSync(personaFile)) {
  console.error("Missing seeded-auth-personas.json â€” run seed first and save output");
  process.exit(1);
}
const seeded = JSON.parse(readFileSync(personaFile, "utf8"));

function headers(userId, tenantId) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-forge-dev-principal": JSON.stringify({ userId, tenantId }),
  };
}

async function call(method, urlPath, userId, tenantId, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: headers(userId, tenantId),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, text, json };
}

function expectStatus(actual, expected) {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  return { ok, actual, expected };
}

const cases = [];
function record(name, persona, permission, expectedEffect, result, notes = "") {
  const pass = result.ok;
  cases.push({
    name,
    persona,
    permission,
    expectedEffect,
    actualStatus: result.actual,
    expectedStatus: result.expected,
    pass,
    notes,
  });
}

const brandingPayload = {
  objectKey: `authz-${Date.now()}`,
  displayName: "Authz probe",
  payload: {
    primaryColor: "#14532d",
    secondaryColor: "#14201a",
    accentColor: "#166534",
    emailFromName: "Forge Authz",
  },
  changeSummary: "authz matrix",
};

async function main() {
  const p = seeded.personas;
  const tenantId = seeded.tenantId || TENANT_A;

  // Forge Creator (platform admin) â€” home platform tenant, target synthetic
  {
    const cat = await call("GET", "/api/v1/config/catalog", PLATFORM_USER, PLATFORM_TENANT);
    record(
      "creator.catalog",
      "forge_creator",
      "platform.*",
      "allow",
      expectStatus(cat.status, 200),
    );

    const draft = await call(
      "POST",
      `/api/v1/tenants/${tenantId}/config/branding`,
      PLATFORM_USER,
      PLATFORM_TENANT,
      brandingPayload,
    );
    record(
      "creator.draft",
      "forge_creator",
      "platform.configuration.update",
      "allow",
      expectStatus(draft.status, [200, 201]),
    );

    const versionId = draft.json?.data?.version?.id;
    if (versionId) {
      const pub = await call(
        "POST",
        `/api/v1/tenants/${tenantId}/config/branding/${brandingPayload.objectKey}/versions/${versionId}/publish`,
        PLATFORM_USER,
        PLATFORM_TENANT,
      );
      record(
        "creator.publish",
        "forge_creator",
        "platform.configuration.publish",
        "allow",
        expectStatus(pub.status, [200, 201]),
      );
    }
  }

  // Platform Support
  {
    const u = p.platform_support.userId;
    const cat = await call("GET", "/api/v1/config/catalog", u, tenantId);
    record(
      "support.catalog",
      "platform_support",
      "update|publish",
      "allow",
      expectStatus(cat.status, 200),
    );
    const draft = await call(
      "POST",
      `/api/v1/tenants/${tenantId}/config/terminology`,
      u,
      tenantId,
      {
        ...brandingPayload,
        objectKey: `support-${Date.now()}`,
        payload: {
          terms: { incident: "Incident", narrative: "Narrative", station: "Station", unit: "Unit" },
        },
      },
    );
    record(
      "support.draft",
      "platform_support",
      "platform.configuration.update",
      "allow",
      expectStatus(draft.status, [200, 201]),
    );
    const vid = draft.json?.data?.version?.id;
    const okey = draft.json?.data?.object?.objectKey ?? `support`;
    if (vid) {
      const pub = await call(
        "POST",
        `/api/v1/tenants/${tenantId}/config/terminology/${okey}/versions/${vid}/publish`,
        u,
        tenantId,
      );
      record(
        "support.publish",
        "platform_support",
        "platform.configuration.publish",
        "allow",
        expectStatus(pub.status, [200, 201]),
      );
    }
    const sec = await call("POST", `/api/v1/tenants/${tenantId}/config/security`, u, tenantId, {
      objectKey: `sec-${Date.now()}`,
      payload: { sessionTimeoutMinutes: 480, mfaRequired: false, passwordMinLength: 12 },
    });
    record(
      "support.security",
      "platform_support",
      "platform.configuration.update",
      "allow",
      expectStatus(sec.status, [200, 201]),
      "support may manage security NS",
    );
  }

  // Tenant Admin â€” allowlist yes, security deny
  {
    const u = p.tenant_admin.userId;
    const draft = await call("POST", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId, {
      ...brandingPayload,
      objectKey: `ta-${Date.now()}`,
    });
    record(
      "ta.branding",
      "tenant_admin",
      "tenant.configuration.update",
      "allow",
      expectStatus(draft.status, [200, 201]),
    );
    const sec = await call("POST", `/api/v1/tenants/${tenantId}/config/security`, u, tenantId, {
      objectKey: `ta-sec-${Date.now()}`,
      payload: { sessionTimeoutMinutes: 480, mfaRequired: false, passwordMinLength: 12 },
    });
    record(
      "ta.security_deny",
      "tenant_admin",
      "namespace allowlist",
      "deny",
      expectStatus(sec.status, 403),
    );
  }

  // Configuration Manager
  {
    const u = p.configuration_manager.userId;
    const draft = await call(
      "POST",
      `/api/v1/tenants/${tenantId}/config/terminology`,
      u,
      tenantId,
      {
        objectKey: `cm-${Date.now()}`,
        payload: {
          terms: { incident: "Call", narrative: "Narrative", station: "Station", unit: "Unit" },
        },
      },
    );
    record(
      "cm.draft",
      "configuration_manager",
      "tenant.configuration.update",
      "allow",
      expectStatus(draft.status, [200, 201]),
    );
    const sec = await call("POST", `/api/v1/tenants/${tenantId}/config/security`, u, tenantId, {
      objectKey: `cm-sec-${Date.now()}`,
      payload: { sessionTimeoutMinutes: 480, mfaRequired: false, passwordMinLength: 12 },
    });
    record(
      "cm.security_deny",
      "configuration_manager",
      "namespace allowlist",
      "deny",
      expectStatus(sec.status, 403),
    );
  }

  // Read-only Auditor
  {
    const u = p.read_only_auditor.userId;
    const cat = await call("GET", "/api/v1/config/catalog", u, tenantId);
    record(
      "auditor.catalog",
      "read_only_auditor",
      "platform.audit.read",
      "allow",
      expectStatus(cat.status, 200),
    );
    const list = await call("GET", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId);
    record(
      "auditor.list",
      "read_only_auditor",
      "platform.audit.read",
      "allow",
      expectStatus(list.status, 200),
    );
    const draft = await call("POST", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId, {
      ...brandingPayload,
      objectKey: `aud-${Date.now()}`,
    });
    record(
      "auditor.draft_deny",
      "read_only_auditor",
      "update",
      "deny",
      expectStatus(draft.status, 403),
    );
  }

  // Standard User
  {
    const u = p.standard_user.userId;
    const cat = await call("GET", "/api/v1/config/catalog", u, tenantId);
    record("standard.catalog_deny", "standard_user", "none", "deny", expectStatus(cat.status, 403));
    const draft = await call("POST", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId, {
      ...brandingPayload,
      objectKey: `std-${Date.now()}`,
    });
    record("standard.draft_deny", "standard_user", "none", "deny", expectStatus(draft.status, 403));
  }

  // Independent: update-only cannot publish
  {
    const u = p.update_only.userId;
    const draft = await call("POST", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId, {
      ...brandingPayload,
      objectKey: `upd-${Date.now()}`,
    });
    record(
      "update_only.draft",
      "update_only",
      "platform.configuration.update",
      "allow",
      expectStatus(draft.status, [200, 201]),
    );
    const vid = draft.json?.data?.version?.id;
    const okey = draft.json?.data?.object?.objectKey;
    if (vid && okey) {
      const pub = await call(
        "POST",
        `/api/v1/tenants/${tenantId}/config/branding/${okey}/versions/${vid}/publish`,
        u,
        tenantId,
      );
      record(
        "update_only.publish_deny",
        "update_only",
        "platform.configuration.publish",
        "deny",
        expectStatus(pub.status, 403),
      );
    }
  }

  // Independent: publish-only cannot draft
  {
    const u = p.publish_only.userId;
    const draft = await call("POST", `/api/v1/tenants/${tenantId}/config/branding`, u, tenantId, {
      ...brandingPayload,
      objectKey: `pub-${Date.now()}`,
    });
    record(
      "publish_only.draft_deny",
      "publish_only",
      "platform.configuration.update",
      "deny",
      expectStatus(draft.status, 403),
    );
    const cat = await call("GET", "/api/v1/config/catalog", u, tenantId);
    record(
      "publish_only.catalog",
      "publish_only",
      "platform.configuration.publish",
      "allow",
      expectStatus(cat.status, 200),
    );
  }

  // Unauthorized
  {
    const res = await fetch(`${BASE}/api/v1/config/catalog`, {
      headers: { accept: "application/json" },
    });
    record("unauth.catalog", "unauthorized", "none", "deny", expectStatus(res.status, 401));
  }

  // Dry-run import (Creator)
  {
    const dry = await call(
      "POST",
      `/api/v1/tenants/${tenantId}/config-import?dryRun=true`,
      PLATFORM_USER,
      PLATFORM_TENANT,
      {
        format: "forge.config.bundle.v1",
        dryRun: true,
        objects: [
          { namespace: "branding", objectKey: "default", displayName: "Branding" },
          { namespace: "not_a_real_ns", objectKey: "x" },
        ],
        versions: [
          {
            namespace: "branding",
            objectKey: "default",
            payloadJson: {
              primaryColor: "#111111",
              secondaryColor: "#222222",
              accentColor: "#333333",
              emailFromName: "DryRun",
            },
          },
        ],
      },
    );
    const data = dry.json?.data;
    const dryOk =
      [200, 201].includes(dry.status) &&
      data?.dryRun === true &&
      data?.summary?.persisted === false &&
      Array.isArray(data?.conflicts) &&
      Array.isArray(data?.validationErrors) &&
      (data.imported?.length ?? 0) === 0;
    record(
      "dry_run_import",
      "forge_creator",
      "platform.configuration.update",
      "allow",
      { ok: dryOk, actual: dry.status, expected: [200, 201] },
      dryOk
        ? "validation-only no persistence"
        : JSON.stringify(data?.summary ?? dry.text).slice(0, 300),
    );
  }

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.filter((c) => !c.pass).length;
  const out = {
    at: new Date().toISOString(),
    base: BASE,
    tenantId,
    totals: { cases: cases.length, passed, failed },
    cases,
  };
  writeFileSync(path.join(evidenceDir, "authz-matrix-full.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: failed === 0, ...out.totals }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
