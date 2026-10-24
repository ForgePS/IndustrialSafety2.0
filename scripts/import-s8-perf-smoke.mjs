#!/usr/bin/env node
/**
 * Synthetic-only S8 Aurora performance smoke.
 *
 * Exercises the authenticated API -> S3 -> SQS -> ECS worker -> Aurora path.
 * It intentionally stays below the unproven 25k/100k sizes and never reads secrets.
 *
 * Usage:
 *   AWS_PROFILE=forge-dev AWS_REGION=us-east-1 node scripts/import-s8-perf-smoke.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const API = process.env.FORGE_API_BASE_URL || "https://d108fstxdv69bo.cloudfront.net";
const PROFILE = process.env.AWS_PROFILE || "forge-dev";
const REGION = process.env.AWS_REGION || "us-east-1";
const EVIDENCE_DIR = "docs/testing/evidence/import-platform";
const PERSONAS_PATH = `${EVIDENCE_DIR}/s8-personas-seed.json`;
const TERMINAL_STATUSES = new Set(["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"]);
const RUN_ID = `s8-perf-${new Date()
  .toISOString()
  .replaceAll(/[-:.TZ]/g, "")
  .slice(0, 14)}-${crypto.randomUUID().slice(0, 6)}`;
// Keep each authenticated request below the deployed CloudFront/WAF body inspection boundary.
const STAGE_CHUNK_SIZE = Number(process.env.FORGE_S8_STAGE_CHUNK_SIZE || 25);
const POLL_INTERVAL_MS = Number(process.env.FORGE_S8_POLL_INTERVAL_MS || 2000);
const POLL_TIMEOUT_MS = Number(process.env.FORGE_S8_POLL_TIMEOUT_MS || 300_000);
const EXPECTED_WORKER_REVISION = process.env.FORGE_S8_EXPECTED_WORKER_REVISION || "26";

const seeds = JSON.parse(fs.readFileSync(PERSONAS_PATH, "utf8"));
const tenantA = tenantFixture("import-acceptance-tenant-a");
const tenantB = tenantFixture("import-acceptance-tenant-b");

function tenantFixture(key) {
  const seed = seeds[key];
  if (!seed?.tenantId || !seed?.personas) throw new Error(`Missing persona fixture ${key}`);
  return { key, tenantId: seed.tenantId, personas: seed.personas };
}

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function idempotencyKey(step) {
  return `${RUN_ID}-${step}-${crypto.randomUUID()}`;
}

function principal(tenant, personaName) {
  return JSON.stringify({
    userId: tenant.personas[personaName].userId,
    tenantId: tenant.tenantId,
  });
}

async function api(method, path, tenant, personaName, { body, idempotent = false } = {}) {
  const headers = {
    Accept: "application/json",
    "X-Forge-Dev-Principal": principal(tenant, personaName),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotent) headers["Idempotency-Key"] = idempotencyKey(path.replaceAll("/", "-"));
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return {
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    json,
  };
}

function requireSuccess(response, step) {
  if (response.status >= 300) {
    throw new Error(
      `${step} returned ${response.status}: ${JSON.stringify(response.json).slice(0, 500)}`,
    );
  }
  return response;
}

function syntheticRows(label, rowCount) {
  return Array.from({ length: rowCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(6, "0");
    const externalId = `${RUN_ID}-${label}-${ordinal}`;
    return {
      sourceRowKey: externalId,
      sourceLine: index + 2,
      mapped: {
        externalId,
        firstName: `Synthetic${ordinal}`,
        lastName: `Perf${label}`,
      },
    };
  });
}

function syntheticCsv(rows) {
  return [
    "external_id,first_name,last_name",
    ...rows.map((row) => {
      const mapped = row.mapped;
      return `${mapped.externalId},${mapped.firstName},${mapped.lastName}`;
    }),
    "",
  ].join("\n");
}

async function pollFor(tenant, personaName, jobId, acceptedStatuses, timeoutMs = POLL_TIMEOUT_MS) {
  const started = performance.now();
  const samples = [];
  while (performance.now() - started < timeoutMs) {
    await sleep(POLL_INTERVAL_MS);
    const response = await api("GET", `/api/v1/imports/jobs/${jobId}/status`, tenant, personaName);
    const status =
      response.json?.data?.job?.status ??
      response.json?.data?.status ??
      response.json?.data?.jobStatus ??
      null;
    samples.push({
      at: now(),
      httpStatus: response.status,
      jobStatus: status,
      progressPercent:
        response.json?.data?.job?.progressPercent ?? response.json?.data?.progress ?? null,
    });
    if (acceptedStatuses.has(status)) {
      return { status, durationMs: Math.round(performance.now() - started), samples };
    }
  }
  return { status: "POLL_TIMEOUT", durationMs: Math.round(performance.now() - started), samples };
}

async function prepareJob({ tenant, label, rowCount }) {
  const rows = syntheticRows(label, rowCount);
  const csv = syntheticCsv(rows);
  const checksumSha256 = crypto.createHash("sha256").update(csv).digest("hex");
  const timing = { startedAt: now() };
  const wallStarted = performance.now();

  requireSuccess(await api("GET", "/api/v1/auth/me", tenant, "operator"), `${label} auth`);

  const upload = requireSuccess(
    await api("POST", "/api/v1/imports/upload", tenant, "operator", {
      idempotent: true,
      body: {
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "personnel",
        displayName: `S8 synthetic performance ${label}`,
        fileName: `${RUN_ID}-${label}.csv`,
        contentType: "text/csv",
        byteSize: Buffer.byteLength(csv),
        checksumSha256,
        format: "csv",
      },
    }),
    `${label} upload init`,
  );
  const jobId = upload.json?.data?.job?.id;
  const uploadUrl = upload.json?.data?.upload?.uploadUrl;
  if (!jobId || !uploadUrl) throw new Error(`${label} upload response lacked jobId or uploadUrl`);

  const putStarted = performance.now();
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/csv",
      "x-amz-server-side-encryption": "aws:kms",
    },
    body: Buffer.from(csv),
  });
  timing.s3PutMs = Math.round(performance.now() - putStarted);
  if (!put.ok) throw new Error(`${label} S3 PUT returned ${put.status}`);

  requireSuccess(
    await api("POST", `/api/v1/imports/upload/${jobId}/complete`, tenant, "operator", {
      idempotent: true,
      body: { checksumSha256 },
    }),
    `${label} upload complete`,
  );

  const scan = await pollFor(
    tenant,
    "operator",
    jobId,
    new Set(["READY_FOR_MAPPING", "MAPPED", "VALIDATION_FAILED", "QUARANTINED", "FAILED"]),
  );
  timing.scanToMappingMs = scan.durationMs;
  if (!["READY_FOR_MAPPING", "MAPPED"].includes(scan.status)) {
    throw new Error(`${label} scan/detect ended ${scan.status}`);
  }

  requireSuccess(
    await api("PUT", `/api/v1/imports/jobs/${jobId}/mappings`, tenant, "operator", {
      idempotent: true,
      body: {
        mappings: [
          { sourceColumn: "external_id", targetField: "externalId", isRequired: true, ordinal: 0 },
          { sourceColumn: "first_name", targetField: "firstName", isRequired: true, ordinal: 1 },
          { sourceColumn: "last_name", targetField: "lastName", isRequired: true, ordinal: 2 },
        ],
      },
    }),
    `${label} mappings`,
  );

  for (const action of ["request-validation", "request-preview", "submit-for-approval"]) {
    requireSuccess(
      await api("POST", `/api/v1/imports/jobs/${jobId}/${action}`, tenant, "operator", {
        idempotent: true,
        body: {},
      }),
      `${label} ${action}`,
    );
  }
  requireSuccess(
    await api("POST", `/api/v1/imports/jobs/${jobId}/approve`, tenant, "approver", {
      idempotent: true,
      body: {},
    }),
    `${label} approve`,
  );

  const stageStarted = performance.now();
  const stageCalls = [];
  for (let offset = 0; offset < rows.length; offset += STAGE_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + STAGE_CHUNK_SIZE);
    const staged = requireSuccess(
      await api("POST", `/api/v1/imports/jobs/${jobId}/rows/stage`, tenant, "operator", {
        idempotent: true,
        body: { rows: chunk },
      }),
      `${label} stage offset ${offset}`,
    );
    stageCalls.push({
      offset,
      rows: chunk.length,
      httpStatus: staged.status,
      durationMs: staged.durationMs,
      stagedCount: staged.json?.data?.stagedCount ?? null,
    });
  }
  timing.stageMs = Math.round(performance.now() - stageStarted);
  timing.prepareWallMs = Math.round(performance.now() - wallStarted);
  timing.preparedAt = now();
  return {
    label,
    tenantKey: tenant.key,
    tenantId: tenant.tenantId,
    tenant,
    jobId,
    rowCount,
    fileBytes: Buffer.byteLength(csv),
    timing,
    stageCalls,
  };
}

async function executePrepared(prepared, batchSize) {
  const startedAt = now();
  const wallStarted = performance.now();
  const execute = requireSuccess(
    await api(
      "POST",
      `/api/v1/imports/jobs/${prepared.jobId}/execute`,
      prepared.tenant,
      "executor",
      {
        idempotent: true,
        body: { batchSize, adapterKey: "reference:generic:record@1" },
      },
    ),
    `${prepared.label} execute`,
  );
  const poll = await pollFor(prepared.tenant, "full", prepared.jobId, TERMINAL_STATUSES);
  const results = await api(
    "GET",
    `/api/v1/imports/jobs/${prepared.jobId}/results`,
    prepared.tenant,
    "full",
  );
  const result = results.json?.data?.result ?? null;
  return {
    label: prepared.label,
    tenantKey: prepared.tenantKey,
    tenantId: prepared.tenantId,
    jobId: prepared.jobId,
    rowCount: prepared.rowCount,
    fileBytes: prepared.fileBytes,
    batchSize,
    adapterKey:
      execute.json?.data?.execution?.adapterKey ??
      execute.json?.data?.job?.adapterKey ??
      "reference:generic:record@1",
    executeHttpStatus: execute.status,
    finalStatus: poll.status,
    executeToTerminalMs: poll.durationMs,
    totalWorkflowWallMs:
      Math.round(performance.now() - wallStarted) + prepared.timing.prepareWallMs,
    startedAt,
    completedAt: now(),
    workerResult: result
      ? {
          totalRows: result.totalRows,
          successfulRows: result.successfulRows,
          failedRows: result.failedRows,
          durationMs: result.durationMs,
          createdRecords: result.createdRecords,
          updatedRecords: result.updatedRecords,
          unchangedRecords: result.unchangedRecords,
        }
      : null,
    timing: prepared.timing,
    stageCalls: prepared.stageCalls,
    pollSamples: poll.samples,
    ok:
      ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(poll.status) &&
      results.status === 200 &&
      result?.totalRows === prepared.rowCount,
  };
}

async function runJob(config) {
  const prepared = await prepareJob(config);
  return executePrepared(prepared, config.batchSize);
}

async function captureFailure(label, operation) {
  try {
    return await operation();
  } catch (error) {
    return {
      label,
      ok: false,
      finalStatus: "HARNESS_ERROR",
      error: String(error),
      completedAt: now(),
    };
  }
}

function awsJson(args) {
  const result = spawnSync(
    "aws",
    [...args, "--profile", PROFILE, "--region", REGION, "--output", "json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return {
      unavailable: true,
      error: (result.stderr || result.stdout || "AWS CLI failed").trim(),
    };
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (error) {
    return { unavailable: true, error: `AWS CLI returned invalid JSON: ${String(error)}` };
  }
}

function metric(namespace, metricName, dimensions, statistic, startTime, endTime) {
  const dimensionArgs = dimensions.map(([Name, Value]) => `Name=${Name},Value=${Value}`);
  const response = awsJson([
    "cloudwatch",
    "get-metric-statistics",
    "--namespace",
    namespace,
    "--metric-name",
    metricName,
    "--dimensions",
    ...dimensionArgs,
    "--start-time",
    startTime,
    "--end-time",
    endTime,
    "--period",
    "60",
    "--statistics",
    statistic,
  ]);
  const datapoints = response.Datapoints ?? [];
  return {
    namespace,
    metricName,
    statistic,
    datapointCount: datapoints.length,
    minimum: datapoints.length ? Math.min(...datapoints.map((p) => p[statistic])) : null,
    maximum: datapoints.length ? Math.max(...datapoints.map((p) => p[statistic])) : null,
    average: datapoints.length
      ? datapoints.reduce((sum, point) => sum + point[statistic], 0) / datapoints.length
      : null,
    unit: datapoints[0]?.Unit ?? null,
    unavailable: response.unavailable ?? false,
    error: response.error,
  };
}

function infrastructureNotes() {
  const service = awsJson([
    "ecs",
    "describe-services",
    "--cluster",
    "forge-development-ecs-platform",
    "--services",
    "forge-development-ecs-worker-service",
  ]);
  const taskDefinitionArn = service.services?.[0]?.taskDefinition;
  const taskDefinition = taskDefinitionArn
    ? awsJson(["ecs", "describe-task-definition", "--task-definition", taskDefinitionArn])
    : { unavailable: true, error: "Worker task definition ARN unavailable" };
  const container = taskDefinition.taskDefinition?.containerDefinitions?.[0];
  return {
    service: "forge-development-ecs-worker-service",
    desiredCount: service.services?.[0]?.desiredCount ?? null,
    runningCount: service.services?.[0]?.runningCount ?? null,
    taskDefinitionArn: taskDefinitionArn ?? null,
    taskCpu: taskDefinition.taskDefinition?.cpu ?? null,
    taskMemory: taskDefinition.taskDefinition?.memory ?? null,
    containerCpu: container?.cpu ?? null,
    containerMemory: container?.memory ?? null,
    containerMemoryReservation: container?.memoryReservation ?? null,
    unavailable: service.unavailable || taskDefinition.unavailable || false,
    error: service.error || taskDefinition.error,
  };
}

function operationalMetrics(startedAt, completedAt) {
  const startTime = new Date(new Date(startedAt).getTime() - 5 * 60_000).toISOString();
  const endTime = new Date(new Date(completedAt).getTime() + 60_000).toISOString();
  const workerDimensions = [
    ["ServiceName", "forge-development-ecs-worker-service"],
    ["ClusterName", "forge-development-ecs-platform"],
  ];
  const auroraDimensions = [["DBClusterIdentifier", "forge-development-rds-aurora"]];
  return {
    window: { startTime, endTime },
    worker: {
      cpuAverage: metric(
        "AWS/ECS",
        "CPUUtilization",
        workerDimensions,
        "Average",
        startTime,
        endTime,
      ),
      cpuMaximum: metric(
        "AWS/ECS",
        "CPUUtilization",
        workerDimensions,
        "Maximum",
        startTime,
        endTime,
      ),
      memoryAverage: metric(
        "AWS/ECS",
        "MemoryUtilization",
        workerDimensions,
        "Average",
        startTime,
        endTime,
      ),
      memoryMaximum: metric(
        "AWS/ECS",
        "MemoryUtilization",
        workerDimensions,
        "Maximum",
        startTime,
        endTime,
      ),
    },
    aurora: {
      cpuMaximum: metric(
        "AWS/RDS",
        "CPUUtilization",
        auroraDimensions,
        "Maximum",
        startTime,
        endTime,
      ),
      connectionsMaximum: metric(
        "AWS/RDS",
        "DatabaseConnections",
        auroraDimensions,
        "Maximum",
        startTime,
        endTime,
      ),
      acuMaximum: metric(
        "AWS/RDS",
        "ACUUtilization",
        auroraDimensions,
        "Maximum",
        startTime,
        endTime,
      ),
    },
  };
}

async function verifyTenantIsolation(concurrencyRuns, preparedByLabel) {
  const checks = [];
  for (const run of concurrencyRuns.filter((item) => item.jobId)) {
    const owner = preparedByLabel.get(run.label)?.tenant;
    const other = owner?.tenantId === tenantA.tenantId ? tenantB : tenantA;
    const crossTenant = await api("GET", `/api/v1/imports/jobs/${run.jobId}/status`, other, "full");
    checks.push({
      jobId: run.jobId,
      ownerTenantId: owner?.tenantId,
      attemptedTenantId: other.tenantId,
      httpStatus: crossTenant.status,
      dataReturned: Boolean(crossTenant.json?.data?.job?.id || crossTenant.json?.data?.id),
      isolated: [403, 404].includes(crossTenant.status) && !crossTenant.json?.data?.job?.id,
    });
  }
  return checks;
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const suiteStartedAt = now();
  const infrastructure = infrastructureNotes();
  if (
    !infrastructure.taskDefinitionArn?.endsWith(`:${EXPECTED_WORKER_REVISION}`) ||
    infrastructure.runningCount !== infrastructure.desiredCount
  ) {
    throw new Error(
      `Worker baseline is not stable on revision ${EXPECTED_WORKER_REVISION}: ${JSON.stringify(infrastructure)}`,
    );
  }

  const performanceRuns = [];
  performanceRuns.push(
    await captureFailure("aurora-500-b50", () =>
      runJob({ tenant: tenantA, label: "aurora-500-b50", rowCount: 500, batchSize: 50 }),
    ),
  );
  performanceRuns.push(
    await captureFailure("aurora-5000-b50", () =>
      runJob({ tenant: tenantA, label: "aurora-5000-b50", rowCount: 5000, batchSize: 50 }),
    ),
  );

  const batchRuns = [performanceRuns[0]];
  batchRuns.push(
    await captureFailure("batch-500-b200", () =>
      runJob({ tenant: tenantA, label: "batch-500-b200", rowCount: 500, batchSize: 200 }),
    ),
  );

  const concurrencyConfigs = [
    { tenant: tenantA, label: "concurrent-a1-200", rowCount: 200 },
    { tenant: tenantA, label: "concurrent-a2-200", rowCount: 200 },
    { tenant: tenantB, label: "concurrent-b1-200", rowCount: 200 },
  ];
  const prepared = await Promise.all(
    concurrencyConfigs.map((config) => captureFailure(config.label, () => prepareJob(config))),
  );
  const preparedByLabel = new Map(prepared.map((item) => [item.label, item]));
  const concurrencyStartedAt = now();
  const concurrencyWallStarted = performance.now();
  const concurrencyRuns = await Promise.all(
    prepared.map((item) =>
      item.jobId
        ? captureFailure(item.label, () => executePrepared(item, 50))
        : Promise.resolve(item),
    ),
  );
  const concurrencyWallMs = Math.round(performance.now() - concurrencyWallStarted);
  const isolationChecks = await verifyTenantIsolation(concurrencyRuns, preparedByLabel);

  const suiteCompletedAt = now();
  const metrics = operationalMetrics(suiteStartedAt, suiteCompletedAt);
  const common = {
    runId: RUN_ID,
    generatedAt: now(),
    environment: "development",
    api: API,
    aws: { profile: PROFILE, region: REGION },
    deployedBaseline: { apiTaskDefinitionRevision: 42, workerTaskDefinitionRevision: 26 },
    syntheticDataOnly: true,
    adapterKey: "reference:generic:record@1",
    infrastructure,
    metrics,
  };

  const successfulPerformanceRuns = performanceRuns.filter((run) => run.ok).length;
  const successfulBatchRuns = batchRuns.filter((run) => run.ok).length;
  const performanceEvidence = {
    ...common,
    defect: "DEF-S8-015",
    status:
      successfulPerformanceRuns === performanceRuns.length
        ? "PARTIAL"
        : successfulPerformanceRuns > 0
          ? "PARTIAL"
          : "NOT_VERIFIED",
    rationale:
      successfulPerformanceRuns === performanceRuns.length
        ? "Live Aurora-backed authenticated runs cover 500 and 5,000 rows. The required 25k/100k matrix was not attempted in this bounded smoke and remains open."
        : "The bounded live Aurora smoke did not complete every planned 500/5,000-row run; see per-run errors. The 25k/100k matrix remains open.",
    runs: performanceRuns,
    untestedRows: [25_000, 100_000, 250_000],
  };
  const batchEvidence = {
    ...common,
    defect: "DEF-S8-020",
    status:
      successfulBatchRuns === batchRuns.length
        ? "VERIFIED"
        : successfulBatchRuns > 0
          ? "PARTIAL"
          : "NOT_VERIFIED",
    rationale:
      "Comparative live Aurora runs use the same synthetic row count with batch sizes 50 and 200; the configured maximum remains 500.",
    runs: batchRuns,
  };
  const concurrencyEvidence = {
    ...common,
    defect: "DEF-S8-016",
    status:
      concurrencyRuns.every((run) => run.ok) && isolationChecks.every((check) => check.isolated)
        ? "PARTIAL"
        : "NOT_VERIFIED",
    rationale:
      "Three jobs ran concurrently across the two seeded tenants, including two same-tenant jobs. Three distinct tenants and a safe maximum in-flight limit remain unverified.",
    concurrencyStartedAt,
    concurrencyWallMs,
    runs: concurrencyRuns,
    isolationChecks,
    distinctTenantCount: new Set(concurrencyRuns.map((run) => run.tenantId).filter(Boolean)).size,
    remainingGaps: [
      "Three or more distinct tenants",
      "Lock-wait and connection-saturation telemetry",
      "Supported maximum in-flight jobs",
    ],
  };

  fs.writeFileSync(
    `${EVIDENCE_DIR}/s8-aurora-perf-matrix.json`,
    JSON.stringify(performanceEvidence, null, 2),
  );
  fs.writeFileSync(
    `${EVIDENCE_DIR}/s8-batch-size-live.json`,
    JSON.stringify(batchEvidence, null, 2),
  );
  fs.writeFileSync(
    `${EVIDENCE_DIR}/s8-concurrency-live.json`,
    JSON.stringify(concurrencyEvidence, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        performance: performanceEvidence.status,
        batchSize: batchEvidence.status,
        concurrency: concurrencyEvidence.status,
        performanceJobs: performanceRuns.map(({ jobId, rowCount, finalStatus, ok }) => ({
          jobId,
          rowCount,
          finalStatus,
          ok,
        })),
        batchJobs: batchRuns.map(({ jobId, batchSize, finalStatus, ok }) => ({
          jobId,
          batchSize,
          finalStatus,
          ok,
        })),
        concurrencyJobs: concurrencyRuns.map(({ jobId, tenantId, finalStatus, ok }) => ({
          jobId,
          tenantId,
          finalStatus,
          ok,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
