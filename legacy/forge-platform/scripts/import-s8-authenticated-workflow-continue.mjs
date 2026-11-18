#!/usr/bin/env node
/**
 * Continue S8 authenticated workflow from an existing READY_FOR_MAPPING job.
 * Usage: FORGE_S8_JOB_ID=<uuid> node scripts/import-s8-authenticated-workflow-continue.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";

const API = process.env.FORGE_API_BASE_URL || "https://d108fstxdv69bo.cloudfront.net";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const jobId = process.env.FORGE_S8_JOB_ID || "019fb3a8-f174-7121-81ae-7dcf6cff255e";
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
const idk = (s) => `s8-cont-${s}-${crypto.randomUUID()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const evidence = {
    startedAt: new Date().toISOString(),
    jobId,
    steps: [],
    ok: false,
  };
  const op = PERSONAS.operator.userId;
  const appr = PERSONAS.approver.userId;
  const exec = PERSONAS.executor.userId;
  const full = PERSONAS.full.userId;
  const rollback = PERSONAS.rollback.userId;

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
  evidence.steps.push({ step: "mappings", status: map.status, data: map.json?.data ?? map.json });
  if (map.status >= 300) throw new Error(`map ${map.status}`);

  for (const [step, path, user] of [
    ["request-validation", `/api/v1/imports/jobs/${jobId}/request-validation`, op],
    ["request-preview", `/api/v1/imports/jobs/${jobId}/request-preview`, op],
    ["submit-for-approval", `/api/v1/imports/jobs/${jobId}/submit-for-approval`, op],
  ]) {
    const r = await api("POST", path, { userId: user, idempotencyKey: idk(step), body: {} });
    evidence.steps.push({ step, status: r.status, data: r.json?.data ?? r.json });
    if (r.status >= 300) throw new Error(`${step} ${r.status}`);
  }

  const approve = await api("POST", `/api/v1/imports/jobs/${jobId}/approve`, {
    userId: appr,
    idempotencyKey: idk("approve"),
    body: {},
  });
  evidence.steps.push({
    step: "approve",
    status: approve.status,
    data: approve.json?.data ?? approve.json,
  });
  if (approve.status >= 300) throw new Error(`approve ${approve.status}`);

  const runTag = jobId.slice(-8);
  const stage = await api("POST", `/api/v1/imports/jobs/${jobId}/rows/stage`, {
    userId: op,
    idempotencyKey: idk("stage"),
    body: {
      rows: [
        {
          sourceRowKey: `S8-${runTag}-001`,
          mapped: { externalId: `S8-${runTag}-001`, firstName: "Ada", lastName: "Lovelace" },
        },
        {
          sourceRowKey: `S8-${runTag}-002`,
          mapped: { externalId: `S8-${runTag}-002`, firstName: "Grace", lastName: "Hopper" },
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
    body: { batchSize: 50 },
  });
  evidence.steps.push({
    step: "execute",
    status: execute.status,
    data: execute.json?.data ?? execute.json,
  });
  if (execute.status >= 300) throw new Error(`execute ${execute.status}`);

  let status = null;
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const st = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, { userId: full });
    status = st.json?.data?.job?.status ?? st.json?.data?.status;
    evidence.steps.push({ step: `poll.${i}`, http: st.status, jobStatus: status });
    if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(status)) break;
  }
  evidence.finalStatus = status;

  const results = await api("GET", `/api/v1/imports/jobs/${jobId}/results`, { userId: full });
  evidence.results = results.json?.data ?? results.json;
  evidence.steps.push({ step: "results", status: results.status });

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
    body: { reason: "S8 evidence rollback classification" },
  });
  evidence.steps.push({
    step: "rollback-request",
    status: rb.status,
    data: rb.json?.data ?? rb.json,
  });

  evidence.ok = ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(status);
  evidence.completedAt = new Date().toISOString();
  evidence.notes = [
    "Upload+malware previously completed; format-detect required manual SQS replay (DEF-S8-023).",
    "Persona-separated approve/execute/rollback used.",
  ];
  fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
  fs.writeFileSync(
    "docs/testing/evidence/import-platform/s8-authenticated-workflow.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify({ ok: evidence.ok, jobId, finalStatus: status }, null, 2));
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
