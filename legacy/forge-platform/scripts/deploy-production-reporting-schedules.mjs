#!/usr/bin/env node
/**
 * Production: reporting schedule run-due pipeline for emailed reports.
 *
 * Creates (idempotent):
 * - SQS forge-production-sqs-reporting-schedules (+ DLQ), KMS-encrypted
 * - EventBridge rule forge-production-events-reporting-schedules (cron 5 * * * ? *, hourly)
 * - Secrets Manager forge-production-secrets-reporting-sweep-token
 * - IAM: worker consume queue; api/worker exec read sweep token
 *
 * Then:
 * - Build/push/roll worker with reporting-schedules consumer
 * - Patch API task def with queue URL + sweep token secret (keeps Resend wiring)
 * - Apply DB migrations (includes 0083 RLS bypass)
 *
 * Usage:
 *   node scripts/deploy-production-reporting-schedules.mjs
 *   node scripts/deploy-production-reporting-schedules.mjs --skip-migrate
 *   node scripts/deploy-production-reporting-schedules.mjs --skip-api-build
 *   node scripts/deploy-production-reporting-schedules.mjs --infra-only
 */
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const API_SERVICE = "forge-production-ecs-platform-api";
const WORKER_SERVICE = "forge-production-ecs-worker-service";
const API_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-platformapi`;
const WORKER_ECR = `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/forge-production-ecr-workerservice`;
const KMS_KEY_ID = "arn:aws:kms:us-east-1:511343547817:key/429f37ca-b7b8-48ea-975d-af276c3369f8";
const QUEUE_NAME = "forge-production-sqs-reporting-schedules";
const DLQ_NAME = "forge-production-sqs-reporting-schedules-dlq";
const RULE_NAME = "forge-production-events-reporting-schedules";
const SWEEP_SECRET_NAME = "forge-production-secrets-reporting-sweep-token";
const FROM_ADDRESS = "noreply@forgepublicsafety.com";

const skipMigrate = process.argv.includes("--skip-migrate");
const skipApiBuild = process.argv.includes("--skip-api-build");
const infraOnly = process.argv.includes("--infra-only");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const tag = `reporting-schedules-${stamp}`;

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function upsertEnv(environment, name, value) {
  const list = Array.isArray(environment) ? [...environment] : [];
  const idx = list.findIndex((e) => e.name === name);
  if (idx >= 0) list[idx] = { name, value };
  else list.push({ name, value });
  return list;
}

function upsertSecret(secrets, name, valueFrom) {
  const list = Array.isArray(secrets) ? [...secrets] : [];
  const idx = list.findIndex((s) => s.name === name);
  if (idx >= 0) list[idx] = { name, valueFrom };
  else list.push({ name, valueFrom });
  return list;
}

function putInlinePolicy(roleName, policyName, document) {
  const path = `.forge-iam-${policyName}.json`;
  fs.writeFileSync(path, JSON.stringify(document));
  sh(
    `aws iam put-role-policy --role-name ${roleName} --policy-name ${policyName} --policy-document file://${path}`,
  );
}

const identity = JSON.parse(shOut("aws sts get-caller-identity --output json"));
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing deploy: account ${identity.Account} != ${ACCOUNT}`);
}

console.log("=== SQS DLQ + queue ===");
let dlqUrl;
try {
  dlqUrl = shOut(
    `aws sqs get-queue-url --queue-name ${DLQ_NAME} --region ${REGION} --query QueueUrl --output text`,
  );
} catch {
  const dlqAttrPath = ".forge-sqs-reporting-schedules-dlq-attrs.json";
  fs.writeFileSync(
    dlqAttrPath,
    JSON.stringify({
      MessageRetentionPeriod: "1209600",
      KmsMasterKeyId: KMS_KEY_ID,
      KmsDataKeyReusePeriodSeconds: "300",
      SqsManagedSseEnabled: "false",
    }),
  );
  dlqUrl = shOut(
    `aws sqs create-queue --queue-name ${DLQ_NAME} --region ${REGION} --attributes file://${dlqAttrPath} --query QueueUrl --output text`,
  );
}
const dlqArn = shOut(
  `aws sqs get-queue-attributes --queue-url ${dlqUrl} --attribute-names QueueArn --region ${REGION} --query Attributes.QueueArn --output text`,
);

let queueUrl;
try {
  queueUrl = shOut(
    `aws sqs get-queue-url --queue-name ${QUEUE_NAME} --region ${REGION} --query QueueUrl --output text`,
  );
} catch {
  const attrs = {
    VisibilityTimeout: "300",
    MessageRetentionPeriod: "345600",
    KmsMasterKeyId: KMS_KEY_ID,
    KmsDataKeyReusePeriodSeconds: "300",
    SqsManagedSseEnabled: "false",
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 3,
    }),
  };
  // PowerShell-safe: write attributes JSON to file
  const attrPath = ".forge-sqs-reporting-schedules-attrs.json";
  fs.writeFileSync(attrPath, JSON.stringify(attrs));
  queueUrl = shOut(
    `aws sqs create-queue --queue-name ${QUEUE_NAME} --region ${REGION} --attributes file://${attrPath} --query QueueUrl --output text`,
  );
}

const queueArn = shOut(
  `aws sqs get-queue-attributes --queue-url ${queueUrl} --attribute-names QueueArn --region ${REGION} --query Attributes.QueueArn --output text`,
);

const queuePolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "events.amazonaws.com" },
      Action: ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
      Resource: queueArn,
    },
  ],
};
const policyPath = ".forge-sqs-reporting-schedules-policy.json";
fs.writeFileSync(
  policyPath,
  JSON.stringify({
    Policy: JSON.stringify(queuePolicy),
  }),
);
sh(
  `aws sqs set-queue-attributes --queue-url ${queueUrl} --attributes file://${policyPath} --region ${REGION}`,
);

console.log("=== EventBridge rule ===");
sh(
  `aws events put-rule --name ${RULE_NAME} --schedule-expression "cron(5 * * * ? *)" --state ENABLED --description "Enqueue reporting schedule run-due sweeps hourly for worker consumption" --region ${REGION}`,
);
const targetsPath = ".forge-eb-reporting-schedules-targets.json";
fs.writeFileSync(
  targetsPath,
  JSON.stringify([
    {
      Id: "ReportingSchedulesQueue",
      Arn: queueArn,
      Input: JSON.stringify({ type: "reporting.schedules.run_due.v1" }),
    },
  ]),
);
sh(`aws events put-targets --rule ${RULE_NAME} --targets file://${targetsPath} --region ${REGION}`);

console.log("=== Sweep token secret ===");
let sweepSecretArn;
try {
  sweepSecretArn = shOut(
    `aws secretsmanager describe-secret --secret-id ${SWEEP_SECRET_NAME} --region ${REGION} --query ARN --output text`,
  );
  console.log(`Secret exists: ${SWEEP_SECRET_NAME}`);
} catch {
  const token = randomBytes(36).toString("base64url");
  const tokenPath = ".forge-reporting-sweep-token.tmp";
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  try {
    sweepSecretArn = shOut(
      `aws secretsmanager create-secret --name ${SWEEP_SECRET_NAME} --description "Shared token for reporting schedule run-due sweep (API + worker)" --secret-string file://${tokenPath} --region ${REGION} --query ARN --output text`,
    );
  } finally {
    fs.rmSync(tokenPath, { force: true });
  }
  console.log(
    `Created secret ${SWEEP_SECRET_NAME} (value not logged; fingerprint=${createHash("sha256").update("created").digest("hex").slice(0, 8)})`,
  );
}

console.log("=== IAM ===");
putInlinePolicy("forge-production-iam-worker-task", "ReportingSchedulesQueueConsume", {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "ReportingSchedulesConsume",
      Effect: "Allow",
      Action: [
        "sqs:ReceiveMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueUrl",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ],
      Resource: queueArn,
    },
  ],
});
putInlinePolicy("forge-production-iam-api-task", "ReportingSchedulesQueueSend", {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "ReportingSchedulesSend",
      Effect: "Allow",
      Action: ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
      Resource: queueArn,
    },
  ],
});
const sweepReadDoc = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "ReportingSweepTokenRead",
      Effect: "Allow",
      Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      Resource: `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${SWEEP_SECRET_NAME}-*`,
    },
  ],
};
putInlinePolicy("forge-production-iam-api-exec", "ReportingSweepTokenRead", sweepReadDoc);
putInlinePolicy("forge-production-iam-worker-exec", "ReportingSweepTokenRead", sweepReadDoc);

console.log(
  JSON.stringify(
    {
      queueUrl,
      queueArn,
      ruleName: RULE_NAME,
      sweepSecretName: SWEEP_SECRET_NAME,
      sweepSecretArn,
    },
    null,
    2,
  ),
);

if (infraOnly) {
  console.log("infra-only: stopping before image rolls");
  process.exit(0);
}

const keep = [
  "family",
  "taskRoleArn",
  "executionRoleArn",
  "networkMode",
  "containerDefinitions",
  "requiresCompatibilities",
  "cpu",
  "memory",
  "volumes",
  "placementConstraints",
  "runtimePlatform",
  "proxyConfiguration",
  "ephemeralStorage",
];

function slim(td) {
  const out = {};
  for (const k of keep) if (td[k] !== undefined) out[k] = td[k];
  return out;
}

function describe(taskDef) {
  return JSON.parse(
    shOut(`aws ecs describe-task-definition --task-definition ${taskDef} --output json`),
  ).taskDefinition;
}

function register(path) {
  return JSON.parse(
    shOut(`aws ecs register-task-definition --cli-input-json file://${path} --output json`),
  ).taskDefinition;
}

console.log("=== ECR login + builds ===");
sh(
  `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`,
  { shell: true },
);

sh(`docker build -f apps/worker-service/Dockerfile -t forge-worker-service:${tag} .`);
sh(`docker tag forge-worker-service:${tag} ${WORKER_ECR}:${tag}`);
sh(`docker push ${WORKER_ECR}:${tag}`);

let apiImage = `${API_ECR}:${tag}`;
if (skipApiBuild) {
  const currentApi = describe(API_SERVICE);
  apiImage = currentApi.containerDefinitions[0].image;
  console.log(`skip-api-build: reusing ${apiImage}`);
} else {
  sh(`docker build -f apps/platform-api/Dockerfile -t forge-platform-api:${tag} .`);
  sh(`docker tag forge-platform-api:${tag} ${API_ECR}:${tag}`);
  sh(`docker push ${API_ECR}:${tag}`);
}

console.log("=== Register + roll worker ===");
const workerTd = describe(WORKER_SERVICE);
const workerContainer = workerTd.containerDefinitions[0];
workerContainer.image = `${WORKER_ECR}:${tag}`;
workerContainer.environment = upsertEnv(
  workerContainer.environment,
  "SQS_REPORTING_SCHEDULES_QUEUE_URL",
  queueUrl,
);
workerContainer.secrets = upsertSecret(
  workerContainer.secrets,
  "FORGE_REPORTING_SWEEP_TOKEN",
  sweepSecretArn,
);
const workerPath = ".forge-td-prod-worker-reporting-schedules.json";
fs.writeFileSync(workerPath, JSON.stringify(slim(workerTd), null, 2));
const workerReg = register(workerPath);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${WORKER_SERVICE} --task-definition ${workerReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);

console.log("=== Register + roll API ===");
const apiTd = describe(API_SERVICE);
const apiContainer = apiTd.containerDefinitions[0];
apiContainer.image = apiImage;
apiContainer.environment = upsertEnv(apiContainer.environment, "FORGE_EMAIL_PROVIDER", "resend");
apiContainer.environment = upsertEnv(apiContainer.environment, "RESEND_FROM_ADDRESS", FROM_ADDRESS);
apiContainer.environment = upsertEnv(apiContainer.environment, "SES_FROM_ADDRESS", FROM_ADDRESS);
apiContainer.environment = upsertEnv(
  apiContainer.environment,
  "SQS_REPORTING_SCHEDULES_QUEUE_URL",
  queueUrl,
);
const resendArn = shOut(
  `aws secretsmanager describe-secret --secret-id forge-production-secrets-resend-api-key --region ${REGION} --query ARN --output text`,
);
apiContainer.secrets = upsertSecret(apiContainer.secrets, "RESEND_API_KEY", resendArn);
apiContainer.secrets = upsertSecret(
  apiContainer.secrets,
  "FORGE_REPORTING_SWEEP_TOKEN",
  sweepSecretArn,
);
const apiPath = ".forge-td-prod-api-reporting-schedules.json";
fs.writeFileSync(apiPath, JSON.stringify(slim(apiTd), null, 2));
const apiReg = register(apiPath);
sh(
  `aws ecs update-service --cluster ${CLUSTER} --service ${API_SERVICE} --task-definition ${apiReg.taskDefinitionArn} --force-new-deployment --region ${REGION} --output json`,
);

console.log("=== Wait services stable ===");
sh(
  `aws ecs wait services-stable --cluster ${CLUSTER} --services ${API_SERVICE} ${WORKER_SERVICE} --region ${REGION}`,
);

if (!skipMigrate) {
  console.log("=== Migrate production (includes 0083) ===");
  sh(
    `node scripts/run-ecs-migrate.mjs --env production --task-definition ${apiReg.taskDefinitionArn}`,
  );
}

console.log(
  JSON.stringify(
    {
      environment: "production",
      tag,
      apiRevision: apiReg.revision,
      workerRevision: workerReg.revision,
      queueUrl,
      ruleName: RULE_NAME,
      migrated: !skipMigrate,
      next: [
        "Confirm Safety Directors have real emails",
        "Enable Monthly department usage email in Safety Supplies settings",
        "Optional: POST /api/v1/reporting/schedules/run-due-sweep with sweep token to test",
      ],
    },
    null,
    2,
  ),
);
