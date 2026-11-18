#!/usr/bin/env node
/**
 * Remove platform.configuration.update / publish from CONFIG_TENANT_ADMIN
 * on the config auth tenant (forge_admin). Prints remaining permission codes.
 */
import { spawnSync } from "node:child_process";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_ID = process.env.FORGE_CONFIG_TENANT_A ?? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193";
const ROLE_CODE = "CONFIG_TENANT_ADMIN";
const REMOVE_CODES = ["platform.configuration.update", "platform.configuration.publish"];

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
import { and, eq, inArray } from "drizzle-orm";
import {
  createDatabase,
  permissions,
  rolePermissions,
  roles,
} from "@forge/database";

const tenantId = ${JSON.stringify(TENANT_ID)};
const roleCode = ${JSON.stringify(ROLE_CODE)};
const removeCodes = ${JSON.stringify(REMOVE_CODES)};

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);

const [role] = await db
  .select({ id: roles.id, code: roles.code, tenantId: roles.tenantId })
  .from(roles)
  .where(and(eq(roles.tenantId, tenantId), eq(roles.code, roleCode)))
  .limit(1);
if (!role) throw new Error("CONFIG_TENANT_ADMIN role missing for tenant");

const removePerms = await db
  .select({ id: permissions.id, code: permissions.code })
  .from(permissions)
  .where(inArray(permissions.code, removeCodes));

let deleted = 0;
for (const perm of removePerms) {
  const removed = await db
    .delete(rolePermissions)
    .where(and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, perm.id)))
    .returning({ permissionId: rolePermissions.permissionId });
  deleted += removed.length;
}

const remaining = await db
  .select({ code: permissions.code })
  .from(rolePermissions)
  .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
  .where(eq(rolePermissions.roleId, role.id))
  .orderBy(permissions.code);

console.info(
  JSON.stringify({
    ok: true,
    tenantId: role.tenantId,
    roleCode: role.code,
    roleId: role.id,
    removedCodes: removePerms.map((p) => p.code),
    deleted,
    remainingPermissionCodes: remaining.map((r) => r.code),
  }),
);
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "strip-config-tenant-admin-platform-perms",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);

console.log("Waiting for task to stop…");
const wait = spawnSync(
  "aws",
  ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn],
  { encoding: "utf8", shell: true, stdio: "inherit" },
);
if (wait.status !== 0) {
  console.error(wait.stderr || wait.stdout);
  process.exit(wait.status ?? 1);
}

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
    "tasks[0].containers[0].{exitCode:exitCode,reason:reason}",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
const parsed = JSON.parse(desc.stdout || "{}");
console.log(JSON.stringify({ taskArn, exitCode: parsed.exitCode, reason: parsed.reason }));

const taskId = taskArn.split("/").pop();
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/development/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "20",
    "--query",
    "events[*].message",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
const messages = JSON.parse(logs.stdout || "[]");
for (const message of messages) {
  // Prefer the structured result line; skip noise that might include connection strings.
  if (typeof message === "string" && message.includes('"remainingPermissionCodes"')) {
    console.log(message);
  }
}
if (!messages.some((m) => typeof m === "string" && m.includes('"remainingPermissionCodes"'))) {
  for (const message of messages.slice(-5)) {
    if (typeof message === "string" && !/password|secret|DATABASE_URL/i.test(message)) {
      console.log(message);
    }
  }
}

process.exit(parsed.exitCode === 0 ? 0 : 1);
