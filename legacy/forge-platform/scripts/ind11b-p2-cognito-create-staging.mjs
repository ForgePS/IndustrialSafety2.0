#!/usr/bin/env node
/**
 * Staging Cognito AdminCreateUser for Producers P2 map (SUPPRESS delivery).
 *
 * Requires:
 *   FORGE_P2_COGNITO_CREATE_AUTHORIZED=true
 *
 * Temp passwords → ~/.forge/producers-p2/ only (never under repo).
 *
 *   node scripts/ind11b-p2-cognito-create-staging.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");
const POOL = "us-east-1_VYjUFLXG4";
const REGION = "us-east-1";

if (process.env.FORGE_P2_COGNITO_CREATE_AUTHORIZED?.trim() !== "true") {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        "Refused: set FORGE_P2_COGNITO_CREATE_AUTHORIZED=true after signing APPROVE-PRODUCERS-COGNITO-CREATE.md",
    }),
  );
  process.exit(2);
}

const plan = JSON.parse(fs.readFileSync(path.join(EVID, "roster-map-plan.json"), "utf8"));
const require = createRequire(path.resolve("apps/platform-api/package.json"));
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  UsernameExistsException,
  UserNotFoundException,
  MessageActionType,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({ region: REGION });

function tempPassword() {
  const raw = randomBytes(18).toString("base64url").slice(0, 16);
  return `Aa1!${raw}`;
}

function findSub(attrs) {
  return attrs?.find((a) => a.Name === "sub")?.Value ?? null;
}

async function getUser(username) {
  try {
    const res = await client.send(
      new AdminGetUserCommand({ UserPoolId: POOL, Username: username }),
    );
    return {
      username: res.Username ?? username,
      subject: findSub(res.UserAttributes),
      status: res.UserStatus ?? null,
      enabled: res.Enabled !== false,
    };
  } catch (e) {
    if (e instanceof UserNotFoundException || e?.name === "UserNotFoundException") {
      return null;
    }
    throw e;
  }
}

async function createOrGet(email, displayName) {
  const existing = await getUser(email);
  if (existing?.subject) {
    return { ...existing, created: false, temporaryPassword: null };
  }

  const temporaryPassword = tempPassword();
  const attrs = [
    { Name: "email", Value: email },
    { Name: "email_verified", Value: "true" },
  ];
  if (displayName) {
    const parts = String(displayName).trim().split(/\s+/);
    if (parts[0]) attrs.push({ Name: "given_name", Value: parts[0] });
    if (parts.length > 1) attrs.push({ Name: "family_name", Value: parts.slice(1).join(" ") });
  }

  try {
    const res = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: POOL,
        Username: email,
        UserAttributes: attrs,
        TemporaryPassword: temporaryPassword,
        MessageAction: MessageActionType.SUPPRESS,
      }),
    );
    return {
      username: res.User?.Username ?? email,
      subject: findSub(res.User?.Attributes),
      status: res.User?.UserStatus ?? "FORCE_CHANGE_PASSWORD",
      enabled: true,
      created: true,
      temporaryPassword,
    };
  } catch (e) {
    if (e instanceof UsernameExistsException || e?.name === "UsernameExistsException") {
      const again = await getUser(email);
      if (!again?.subject) throw e;
      return { ...again, created: false, temporaryPassword: null };
    }
    throw e;
  }
}

const results = [];
const secrets = [];

for (const u of plan.users) {
  if (u.cognitoAction === "LINK_EXISTING") {
    const existing = await getUser(u.email);
    if (!existing?.subject) {
      results.push({
        email: u.email,
        ok: false,
        error: "LINK_EXISTING but Cognito user not found",
      });
      continue;
    }
    results.push({
      email: u.email,
      ok: true,
      cognitoAction: "LINK_EXISTING",
      created: false,
      subject: existing.subject,
      username: existing.username,
      status: existing.status,
      roleCode: u.roleCode,
      firebaseUid: u.firebaseUid,
      targetTenantId: u.targetTenantId,
    });
    continue;
  }

  const created = await createOrGet(u.email, u.displayName);
  if (!created.subject) {
    results.push({ email: u.email, ok: false, error: "No Cognito subject returned" });
    continue;
  }
  results.push({
    email: u.email,
    ok: true,
    cognitoAction: u.cognitoAction,
    created: created.created,
    subject: created.subject,
    username: created.username,
    status: created.status,
    roleCode: u.roleCode,
    firebaseUid: u.firebaseUid,
    targetTenantId: u.targetTenantId,
    temporaryPasswordIssued: Boolean(created.temporaryPassword),
  });
  if (created.temporaryPassword) {
    secrets.push({
      email: u.email,
      subject: created.subject,
      temporaryPassword: created.temporaryPassword,
      issuedAt: new Date().toISOString(),
    });
  }
}

const secretDir = path.join(os.homedir(), ".forge", "producers-p2");
fs.mkdirSync(secretDir, { recursive: true });
const secretPath = path.join(
  secretDir,
  `staging-temp-passwords-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
fs.writeFileSync(
  secretPath,
  `${JSON.stringify(
    {
      warning: "LOCAL ONLY — do not commit or share broadly",
      poolId: POOL,
      messageAction: "SUPPRESS",
      issuedAt: new Date().toISOString(),
      passwords: secrets,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

const evidence = {
  ok: results.every((r) => r.ok),
  at: new Date().toISOString(),
  phase: "PRODUCERS-P2-cognito-create-staging",
  poolId: POOL,
  targetTenantId: plan.target.tenantId,
  counts: {
    total: results.length,
    created: results.filter((r) => r.created).length,
    linkedExisting: results.filter((r) => r.cognitoAction === "LINK_EXISTING").length,
    passwordFileLocal: secretPath,
    passwordsIssued: secrets.length,
  },
  users: results,
};
fs.writeFileSync(
  path.join(EVID, "cognito-create-staging-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      ok: evidence.ok,
      counts: evidence.counts,
      evidence: path.join(EVID, "cognito-create-staging-result.json"),
      secretPath,
    },
    null,
    2,
  ),
);
process.exit(evidence.ok ? 0 : 1);
