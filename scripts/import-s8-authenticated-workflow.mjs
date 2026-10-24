#!/usr/bin/env node
/**
 * S8 P1 — live authenticated import workflow against development API (DEF-S8-002 API path).
 * Uses seeded personas + synthetic CSV. No passwords. Secrets redacted in evidence.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createHash } from "node:crypto";

const API = process.env.FORGE_API_BASE_URL || "https://d108fstxdv69bo.cloudfront.net";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const PERSONAS = JSON.parse(
  fs.readFileSync("docs/testing/evidence/import-platform/s8-personas-seed.json", "utf8"),
)["import-acceptance-tenant-a"].personas;

const runId = crypto.randomUUID().slice(0, 8);
const CSV = `external_id,first_name,last_name\nS8-${runId}-001,Ada,Lovelace\nS8-${runId}-002,Grace,Hopper\n`;
const SHA = createHash("sha256").update(CSV).digest("hex");

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
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), json };
}

function idk(step) {
  return `s8-wf-${step}-${crypto.randomUUID()}`;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const evidence = {
    startedAt: new Date().toISOString(),
    api: API,
    tenantId: TENANT_A,
    steps: [],
    jobId: null,
    finalStatus: null,
    resultCounts: null,
    correlationIds: [],
    ok: false,
  };

  const op = PERSONAS.operator.userId;
  const appr = PERSONAS.approver.userId;
  const exec = PERSONAS.executor.userId;
  const full = PERSONAS.full.userId;

  // 0. me
  {
    const r = await api("GET", "/api/v1/auth/me", { userId: op });
    evidence.steps.push({
      step: "auth.me.operator",
      status: r.status,
      permissions: r.json?.data?.permissions,
    });
    if (r.status !== 200) throw new Error("operator /me failed");
  }

  // 1. upload init
  const upload = await api("POST", "/api/v1/imports/upload", {
    userId: op,
    idempotencyKey: idk("upload"),
    body: {
      productKey: "FORGE_RMS",
      moduleKey: "CORE",
      recordCategory: "personnel",
      displayName: `S8 Evidence Clean CSV ${runId}`,
      fileName: `s8-clean-${runId}.csv`,
      contentType: "text/csv",
      byteSize: Buffer.byteLength(CSV),
      checksumSha256: SHA,
      format: "csv",
    },
  });
  evidence.steps.push({
    step: "upload.init",
    status: upload.status,
    jobId: upload.json?.data?.job?.id,
    hasPresign: Boolean(upload.json?.data?.upload?.uploadUrl),
  });
  if (upload.status >= 300) {
    evidence.steps.push({ step: "upload.init.body", body: upload.json });
    throw new Error(`upload init ${upload.status}`);
  }
  const jobId = upload.json.data.job.id;
  const uploadUrl = upload.json.data.upload.uploadUrl;
  evidence.jobId = jobId;
  if (upload.json?.meta?.correlationId)
    evidence.correlationIds.push(upload.json.meta.correlationId);
  if (upload.json?.data?.job?.correlationId)
    evidence.correlationIds.push(upload.json.data.job.correlationId);

  // 2. PUT bytes — signed headers are content-length + x-amz-server-side-encryption
  // (checksum is query-signed; do not send as request header)
  if (!uploadUrl) throw new Error("missing upload URL");
  const bodyBuf = Buffer.from(CSV, "utf8");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/csv",
      "x-amz-server-side-encryption": "aws:kms",
    },
    body: bodyBuf,
  });
  const putText = put.ok ? "" : await put.text();
  evidence.steps.push({
    step: "upload.put",
    status: put.status,
    errorSnippet: putText.slice(0, 300) || undefined,
  });
  if (!put.ok) throw new Error(`S3 put ${put.status}`);

  // 3. complete
  const complete = await api("POST", `/api/v1/imports/upload/${jobId}/complete`, {
    userId: op,
    idempotencyKey: idk("complete"),
    body: { checksumSha256: SHA },
  });
  evidence.steps.push({
    step: "upload.complete",
    status: complete.status,
    body: complete.json?.data ?? complete.json,
  });
  if (complete.status >= 300) {
    fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
    fs.writeFileSync(
      "docs/testing/evidence/import-platform/s8-authenticated-workflow.json",
      JSON.stringify(evidence, null, 2),
    );
    throw new Error(`complete ${complete.status}`);
  }

  // 4. poll scan → READY_FOR_MAPPING (with format-detect replay if stuck — DEF-S8-023)
  let status = null;
  let currentStage = null;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const st = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, { userId: op });
    status = st.json?.data?.job?.status ?? st.json?.data?.status ?? st.json?.data?.jobStatus;
    currentStage = st.json?.data?.job?.currentStage ?? st.json?.data?.currentStage;
    evidence.steps.push({
      step: `poll.${i}`,
      http: st.status,
      jobStatus: status,
      stage: currentStage,
    });
    if (
      ["READY_FOR_MAPPING", "MAPPED", "VALIDATION_FAILED", "QUARANTINED", "FAILED"].includes(status)
    )
      break;
  }
  if (status === "SCANNING" && currentStage === "FORMAT_DETECTION") {
    if (process.env.FORGE_S8_REQUIRE_NO_REPLAY === "1") {
      evidence.finalStatus = status;
      evidence.defS8023 = "FAIL_STILL_REQUIRES_REPLAY";
      fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
      fs.writeFileSync(
        "docs/testing/evidence/import-platform/s8-authenticated-workflow-no-replay.json",
        JSON.stringify(evidence, null, 2),
      );
      throw new Error("DEF-S8-023: still stuck at FORMAT_DETECTION — manual replay required");
    }
    const fileRes = await api("GET", `/api/v1/imports/${jobId}/file`, { userId: op });
    const file = fileRes.json?.data;
    evidence.steps.push({
      step: "detect.replay.prepare",
      fileId: file?.id,
      status: fileRes.status,
    });
    if (file?.id && file?.s3Bucket && file?.s3Key) {
      const { execSync } = await import("node:child_process");
      const detectBody = {
        type: "import.upload.detect.v1",
        version: 1,
        tenantId: TENANT_A,
        jobId,
        fileId: file.id,
        correlationId: `s8-detect-replay-${runId}`,
        actorUserId: op,
        s3Bucket: file.s3Bucket,
        s3Key: file.s3Key,
        expectedFormat: "csv",
        enqueuedAt: new Date().toISOString(),
      };
      fs.writeFileSync(".forge-detect-msg.json", JSON.stringify(detectBody));
      const queueUrl = execSync(
        "aws sqs get-queue-url --queue-name forge-development-sqs-imports --query QueueUrl --output text",
        { encoding: "utf8" },
      ).trim();
      execSync(
        `aws sqs send-message --queue-url ${queueUrl} --message-body file://.forge-detect-msg.json --message-attributes "messageType={DataType=String,StringValue=import.upload.detect.v1},tenantId={DataType=String,StringValue=${TENANT_A}}"`,
        { encoding: "utf8", shell: true },
      );
      evidence.steps.push({ step: "detect.replay.enqueued", queueUrlHost: new URL(queueUrl).host });
      for (let i = 0; i < 20; i++) {
        await sleep(2000);
        const st = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, { userId: op });
        status = st.json?.data?.job?.status ?? st.json?.data?.status;
        currentStage = st.json?.data?.job?.currentStage ?? st.json?.data?.currentStage;
        evidence.steps.push({
          step: `poll.afterDetect.${i}`,
          http: st.status,
          jobStatus: status,
          stage: currentStage,
        });
        if (
          ["READY_FOR_MAPPING", "MAPPED", "VALIDATION_FAILED", "QUARANTINED", "FAILED"].includes(
            status,
          )
        )
          break;
      }
    }
  }
  if (status !== "READY_FOR_MAPPING" && status !== "MAPPED") {
    evidence.finalStatus = status;
    fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
    fs.writeFileSync(
      "docs/testing/evidence/import-platform/s8-authenticated-workflow.json",
      JSON.stringify(evidence, null, 2),
    );
    throw new Error(`scan/detect did not reach READY_FOR_MAPPING: ${status}`);
  }

  // 5. mappings
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
  evidence.steps.push({
    step: "mappings.put",
    status: map.status,
    jobStatus: map.json?.data?.status,
  });
  if (map.status >= 300) throw new Error(`map ${map.status}`);

  // 6-8 validation / preview / submit (audit orchestration)
  for (const [step, path, user] of [
    ["request-validation", `/api/v1/imports/jobs/${jobId}/request-validation`, op],
    ["request-preview", `/api/v1/imports/jobs/${jobId}/request-preview`, op],
    ["submit-for-approval", `/api/v1/imports/jobs/${jobId}/submit-for-approval`, op],
  ]) {
    const r = await api("POST", path, { userId: user, idempotencyKey: idk(step), body: {} });
    evidence.steps.push({ step, status: r.status, data: r.json?.data ?? r.json });
    if (r.status >= 300) throw new Error(`${step} ${r.status}`);
  }

  // 9. approve
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

  // 10. stage rows (required for execute)
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
    step: "rows.stage",
    status: stage.status,
    data: stage.json?.data ?? stage.json,
  });
  if (stage.status >= 300) throw new Error(`stage ${stage.status}`);

  // 11. execute — omit adapterKey when FORGE_S8_DEFAULT_ADAPTER=1 (DEF-S8-024)
  const executeBody =
    process.env.FORGE_S8_DEFAULT_ADAPTER === "1"
      ? { batchSize: 50 }
      : { batchSize: 50, adapterKey: "reference:generic:record@1" };
  const execute = await api("POST", `/api/v1/imports/jobs/${jobId}/execute`, {
    userId: exec,
    idempotencyKey: idk("execute"),
    body: executeBody,
  });
  evidence.steps.push({
    step: "execute",
    status: execute.status,
    adapterKeyUsed:
      execute.json?.data?.job?.adapterKey ?? execute.json?.data?.execution?.adapterKey,
    omittedAdapterKey: process.env.FORGE_S8_DEFAULT_ADAPTER === "1",
    data: execute.json?.data ?? execute.json,
  });
  if (execute.status >= 300) throw new Error(`execute ${execute.status}`);

  // 12. poll completion
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const st = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, { userId: full });
    status = st.json?.data?.job?.status ?? st.json?.data?.status ?? st.json?.data?.jobStatus;
    evidence.steps.push({
      step: `exec.poll.${i}`,
      http: st.status,
      jobStatus: status,
      progress: st.json?.data?.job?.progressPercent ?? st.json?.data?.progress,
    });
    if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(status)) break;
  }
  evidence.finalStatus = status;

  const results = await api("GET", `/api/v1/imports/jobs/${jobId}/results`, { userId: full });
  evidence.resultCounts = results.json?.data ?? results.json;
  evidence.steps.push({ step: "results", status: results.status });

  const dl = await api("POST", `/api/v1/imports/jobs/${jobId}/results/download`, {
    userId: full,
    body: { privileged: false },
  });
  evidence.steps.push({
    step: "results.download",
    status: dl.status,
    hasUrl: Boolean(dl.json?.data?.url || dl.json?.data?.downloadUrl),
    // never persist raw URL query secrets
    urlHost: (() => {
      try {
        return new URL(dl.json?.data?.url || dl.json?.data?.downloadUrl || "http://invalid").host;
      } catch {
        return null;
      }
    })(),
  });

  const rb = await api("POST", `/api/v1/imports/jobs/${jobId}/rollback-request`, {
    userId: PERSONAS.rollback.userId,
    idempotencyKey: idk("rollback"),
    body: { reason: "S8 evidence rollback classification drill" },
  });
  evidence.steps.push({
    step: "rollback-request",
    status: rb.status,
    data: rb.json?.data ?? rb.json,
  });

  evidence.completedAt = new Date().toISOString();
  evidence.detectReplayUsed = evidence.steps.some((s) => s.step === "detect.replay.enqueued");
  evidence.defS8023 = evidence.detectReplayUsed ? "REPLAY_USED" : "AUTO_DETECT_OK";
  const requireNoReplay = process.env.FORGE_S8_REQUIRE_NO_REPLAY === "1";
  evidence.ok =
    ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(evidence.finalStatus) &&
    (!requireNoReplay || !evidence.detectReplayUsed);

  fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
  const outPath = requireNoReplay
    ? "docs/testing/evidence/import-platform/s8-authenticated-workflow-no-replay.json"
    : "docs/testing/evidence/import-platform/s8-authenticated-workflow.json";
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: evidence.ok,
        jobId,
        finalStatus: evidence.finalStatus,
        detectReplayUsed: evidence.detectReplayUsed,
        defS8023: evidence.defS8023,
        outPath,
      },
      null,
      2,
    ),
  );
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  try {
    fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
    fs.writeFileSync(
      "docs/testing/evidence/import-platform/s8-authenticated-workflow-error.json",
      JSON.stringify({ error: String(err), stack: err?.stack }, null, 2),
    );
  } catch {
    /* ignore */
  }
  process.exit(1);
});
