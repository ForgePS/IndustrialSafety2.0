#!/usr/bin/env node
/**
 * Verify specialty feature flag: enabled only for rms-synthetic-fd; remove from B if present.
 */
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const adminSecretName =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-development-secrets-database";
const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, isNull } from "drizzle-orm";
import {
  createDatabase,
  featureDefinitions,
  featureOverrides,
  tenants,
} from "@forge/database";

const FLAG = "rms.neris.specialty_workflows.enabled";
const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const def = await db.query.featureDefinitions.findFirst({ where: eq(featureDefinitions.key, FLAG) });
if (!def) throw new Error("flag definition missing");
const allTenants = await db.select({ id: tenants.id, key: tenants.tenantKey }).from(tenants);
const report = [];
for (const t of allTenants) {
  const ov = await db.query.featureOverrides.findFirst({
    where: and(
      eq(featureOverrides.tenantId, t.id),
      eq(featureOverrides.featureDefinitionId, def.id),
      isNull(featureOverrides.organizationId),
      isNull(featureOverrides.userId),
    ),
  });
  report.push({ tenantKey: t.key, override: ov?.valueJson ?? null, overrideId: ov?.id ?? null });
  if (t.key === "rms-synthetic-fd-b" && ov) {
    await db.delete(featureOverrides).where(eq(featureOverrides.id, ov.id));
    report[report.length - 1].removed = true;
  }
  if (t.key === "rms-synthetic-fd" && ov?.valueJson !== true) {
    throw new Error("approved synthetic FD missing specialty override=true");
  }
}
const ovAll = await db.select().from(featureOverrides).where(eq(featureOverrides.featureDefinitionId, def.id));
const enriched = [];
for (const ov of ovAll) {
  const [t] = await db.select({ key: tenants.tenantKey }).from(tenants).where(eq(tenants.id, ov.tenantId)).limit(1);
  enriched.push({
    tenantKey: t?.key,
    valueJson: ov.valueJson,
    organizationId: ov.organizationId,
    userId: ov.userId,
  });
}
console.info(JSON.stringify({ ok: true, defaultValue: def.defaultValueJson, allOverrides: enriched, report }, null, 2));

process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "verify-specialty-flag-tenants",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);

const { spawnSync } = await import("node:child_process");
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
});
const desc = spawnSync(
  "aws",
  [
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
    "--query",
    "tasks[0].containers[0].exitCode",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);
const exitCode = Number((desc.stdout || "").trim());
console.log(
  spawnSync(
    "aws",
    [
      "logs",
      "get-log-events",
      "--log-group-name",
      "/forge/development/platform-api",
      "--log-stream-name",
      `platform-api/platform-api/${taskArn.split("/").pop()}`,
      "--limit",
      "5",
      "--query",
      "events[-1].message",
      "--output",
      "text",
    ],
    { encoding: "utf8", shell: true },
  ).stdout,
);
process.exit(exitCode === 0 ? 0 : 1);
