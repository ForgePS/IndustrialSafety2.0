#!/usr/bin/env node
/**
 * Build Cognito import map from Auth freeze (no AWS writes).
 *
 *   node scripts/ind11b-p2-map-roster.mjs
 */
import fs from "node:fs";
import path from "node:path";

const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");
const freezePath = path.join(EVID, "roster-export-latest.json");
const freeze = JSON.parse(fs.readFileSync(freezePath, "utf8"));

const STAGING = {
  tenantKey: "producers-rice-mill-staging",
  tenantId: "0882c865-59c2-49a6-ab88-ce6ca89be30c",
};
const POOL = "us-east-1_VYjUFLXG4";
const INDUSTRIAL_CLIENT = "3rls9835j4qs3jmchb3uh7ketm";

function roleFor(email) {
  const e = email.toLowerCase();
  if (e === "admin@forgepublicsafety.com") {
    return {
      roleCode: "IND3V_INDUSTRIAL_ADMIN",
      cognitoAction: "LINK_EXISTING",
      note: "Already in Cognito / platform; ensure staging membership only",
    };
  }
  if (e === "safetyadmin@producersrice.com") {
    return {
      roleCode: "IND3V_INDUSTRIAL_ADMIN",
      cognitoAction: "CREATE_IF_MISSING",
      note: "Plant safety admin",
    };
  }
  return {
    roleCode: "IND3V_INDUSTRIAL_OPERATOR",
    cognitoAction: "CREATE_IF_MISSING",
    note: "Default operator (view-capable day-1)",
  };
}

const users = freeze.users.map((u) => {
  const r = roleFor(u.emailNormalized || u.email);
  return {
    firebaseUid: u.uid,
    email: u.emailNormalized || u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    disabled: u.disabled,
    businessIds: u.businessIds,
    targetTenantId: STAGING.tenantId,
    targetTenantKey: STAGING.tenantKey,
    roleCode: r.roleCode,
    cognitoAction: r.cognitoAction,
    note: r.note,
  };
});

const plan = {
  ok: true,
  phase: "PRODUCERS-P2-roster-map",
  builtAt: new Date().toISOString(),
  sourceFreezeAt: freeze.freezeAt,
  sourceRosterFile: freeze.authorization?.approval
    ? path.basename(
        fs
          .readdirSync(EVID)
          .filter((f) => f.startsWith("roster-export-20"))
          .sort()
          .at(-1) || "roster-export-latest.json",
      )
    : "roster-export-latest.json",
  cognitoUserPoolId: POOL,
  cognitoIndustrialClientId: INDUSTRIAL_CLIENT,
  target: STAGING,
  messageAction: "SUPPRESS",
  passwordStrategy: "TEMP_FORCE_CHANGE",
  counts: {
    total: users.length,
    createIfMissing: users.filter((u) => u.cognitoAction === "CREATE_IF_MISSING").length,
    linkExisting: users.filter((u) => u.cognitoAction === "LINK_EXISTING").length,
    admin: users.filter((u) => u.roleCode === "IND3V_INDUSTRIAL_ADMIN").length,
    operator: users.filter((u) => u.roleCode === "IND3V_INDUSTRIAL_OPERATOR").length,
  },
  users,
};

const out = path.join(EVID, "roster-map-plan.json");
fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, out, counts: plan.counts }, null, 2));
