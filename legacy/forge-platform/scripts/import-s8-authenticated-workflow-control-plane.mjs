#!/usr/bin/env node
/**
 * S8 authenticated API workflow via control-plane create (skips upload/scan flake).
 * Uses reference:generic:record@1 adapter (DEF-S8-024).
 */
import crypto from "node:crypto";
import fs from "node:fs";

const API = process.env.FORGE_API_BASE_URL || "https://d108fstxdv69bo.cloudfront.net";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const PERSONAS = JSON.parse(
  fs.readFileSync("docs/testing/evidence/import-platform/s8-personas-seed.json", "utf8"),
)["import-acceptance-tenant-a"].personas;

function principal(userId) {
  return JSON.stringify({ userId, tenantId: TENANT_A });
}
async function api(method, path, { userId, body, idempotencyKey } = {}) {
  const headers = {
    Accept: "application/json",
    "X-Forge-Dev-Principal": principal(userId),
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
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}
const idk = (s) => `s8-cp-${s}-${crypto.randomUUID()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const evidence = {
    startedAt: new Date().toISOString(),
    path: "control-plane",
    steps: [],
    ok: false,
  };
  const op = PERSONAS.operator.userId;
  const appr = PERSONAS.approver.userId;
  const exec = PERSONAS.executor.userId;
  const full = PERSONAS.full.userId;
  const rollback = PERSONAS.rollback.userId;
  const runId = crypto.randomUUID().slice(0, 8);

  const create = await api("POST", "/api/v1/imports/jobs", {
    userId: op,
    idempotencyKey: idk("create"),
    body: {
      productKey: "FORGE_RMS",
      moduleKey: "CORE",
      recordCategory: "personnel",
      displayName: `S8 CP Evidence ${runId}`,
      description: "synthetic S8 control-plane evidence",
      sourceType: "csv",
      requestedMode: "UPSERT",
    },
  });
  evidence.steps.push({
    step: "create",
    status: create.status,
    data: create.json?.data ?? create.json,
  });
  if (create.status >= 300) throw new Error(`create ${create.status}`);
  const jobId = create.json.data.id;
  evidence.jobId = jobId;

  const map = await api("PUT", `/api/v1/imports/jobs/${jobId}/mappings`, {
    userId: op,
    idempotencyKey: idk("map"),
    body: {
      mappings: [
        { sourceColumn: "external_id", targetField: "externalId", isRequired: true, ordinal: 0 },
        { sourceColumn: "first_name", targetField: "firstName", isRequired: true, ordinal: 1 },
        { sourceColumn: "last_name", targetField: "lastName", isRequired: true, ordinal: 2 },
      ],
    },
  });
  evidence.steps.push({ step: "map", status: map.status });
  if (map.status >= 300) throw new Error(`map ${map.status}`);

  for (const step of ["request-validation", "request-preview", "submit-for-approval"]) {
    const r = await api("POST", `/api/v1/imports/jobs/${jobId}/${step}`, {
      userId: op,
      idempotencyKey: idk(step),
      body: {},
    });
    evidence.steps.push({ step, status: r.status, data: r.json?.data ?? r.json });
    if (r.status >= 300) throw new Error(`${step} ${r.status}`);
  }

  const approve = await api("POST", `/api/v1/imports/jobs/${jobId}/approve`, {
    userId: appr,
    idempotencyKey: idk("approve"),
    body: {},
  });
  evidence.steps.push({ step: "approve", status: approve.status });
  if (approve.status >= 300) throw new Error(`approve ${approve.status}`);

  const stage = await api("POST", `/api/v1/imports/jobs/${jobId}/rows/stage`, {
    userId: op,
    idempotencyKey: idk("stage"),
    body: {
      rows: [
        {
          sourceRowKey: `S8-${runId}-001`,
          mapped: { externalId: `S8-${runId}-001`, firstName: "Ada", lastName: "Lovelace" },
        },
        {
          sourceRowKey: `S8-${runId}-002`,
          mapped: { externalId: `S8-${runId}-002`, firstName: "Grace", lastName: "Hopper" },
        },
      ],
    },
  });
  evidence.steps.push({
    step: "stage",
    status: stage.status,
    data: stage.json?.data ?? stage.json,
  });
  if (stage.status >= 300) throw new Error(`stage ${stage.status}`);

  const execute = await api("POST", `/api/v1/imports/jobs/${jobId}/execute`, {
    userId: exec,
    idempotencyKey: idk("execute"),
    body: { batchSize: 50, adapterKey: "reference:generic:record@1" },
  });
  evidence.steps.push({
    step: "execute",
    status: execute.status,
    data: execute.json?.data ?? execute.json,
  });
  if (execute.status >= 300) throw new Error(`execute ${execute.status}`);

  let status = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const st = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, { userId: full });
    status = st.json?.data?.job?.status ?? st.json?.data?.status;
    evidence.steps.push({ step: `poll.${i}`, http: st.status, jobStatus: status });
    if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(status)) break;
  }
  evidence.finalStatus = status;
  const results = await api("GET", `/api/v1/imports/jobs/${jobId}/results`, { userId: full });
  evidence.results = results.json?.data ?? results.json;
  const dl = await api("POST", `/api/v1/imports/jobs/${jobId}/results/download`, {
    userId: full,
    body: { privileged: false },
  });
  evidence.steps.push({
    step: "results.download",
    status: dl.status,
    hasUrl: Boolean(dl.json?.data?.url || dl.json?.data?.downloadUrl),
  });
  const rb = await api("POST", `/api/v1/imports/jobs/${jobId}/rollback-request`, {
    userId: rollback,
    idempotencyKey: idk("rollback"),
    body: { reason: "S8 control-plane rollback classification" },
  });
  evidence.steps.push({
    step: "rollback-request",
    status: rb.status,
    data: rb.json?.data ?? rb.json,
  });
  evidence.ok = ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(status);
  evidence.completedAt = new Date().toISOString();
  fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
  fs.writeFileSync(
    "docs/testing/evidence/import-platform/s8-authenticated-workflow-control-plane.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify({ ok: evidence.ok, jobId, finalStatus: status }, null, 2));
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
