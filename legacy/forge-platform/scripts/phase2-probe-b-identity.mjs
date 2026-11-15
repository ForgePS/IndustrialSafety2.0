#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, sql } from "drizzle-orm";
import { createDatabase, authenticationIdentities, users, userTenantMemberships, tenants, withTenantTransaction } from "@forge/database";

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const sub = "544854e8-f0a1-7082-ca0f-e1a26122aa2c";
const tenantB = "019fa017-c632-74ae-b70b-672711c72f20";

const ids = await withTenantTransaction(db, tenantB, async (tx) =>
  tx.select().from(authenticationIdentities).where(and(
    eq(authenticationIdentities.provider, "COGNITO"),
    eq(authenticationIdentities.providerSubject, sub),
  ))
);

const out = { currentUser: (await db.execute(sql\`select current_user as u\`))[0]?.u, identities: [] };
for (const id of ids) {
  const [u] = await withTenantTransaction(db, tenantB, async (tx) =>
    tx.select().from(users).where(eq(users.id, id.userId)).limit(1)
  );
  const mems = await withTenantTransaction(db, tenantB, async (tx) =>
    tx.select().from(userTenantMemberships).where(eq(userTenantMemberships.userId, id.userId))
  );
  out.identities.push({ identityId: id.id, tenantId: id.tenantId, userId: id.userId, email: u?.primaryEmail, membershipCount: mems.length, memberships: mems.map(m => ({ tenantId: m.tenantId, status: m.status })) });
}
console.info(JSON.stringify({ ok: true, ...out }));
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "probe-b-identity",
);
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  stdio: "inherit",
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
console.log("exitCode", (desc.stdout || "").trim());
process.exit(Number((desc.stdout || "1").trim()) === 0 ? 0 : 1);
