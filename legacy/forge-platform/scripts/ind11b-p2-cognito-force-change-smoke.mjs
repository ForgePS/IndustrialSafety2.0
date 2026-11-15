#!/usr/bin/env node
/**
 * H4: complete FORCE_CHANGE_PASSWORD for named staging smoke users via
 * AdminInitiateAuth (no Hosted UI), store smoke passwords under ~/.forge only.
 *
 *   node scripts/ind11b-p2-cognito-force-change-smoke.mjs
 *
 * Does not print passwords. Writes evidence without secrets.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const POOL = "us-east-1_VYjUFLXG4";
const CLIENT = "3rls9835j4qs3jmchb3uh7ketm";
const REGION = "us-east-1";
const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");
const TARGETS = ["safetyadmin@producersrice.com", "jlackie@producersrice.com"];

const secretDir = path.join(os.homedir(), ".forge", "producers-p2");
const tempFiles = fs
  .readdirSync(secretDir)
  .filter((f) => f.startsWith("staging-temp-passwords-") && f.endsWith(".json"))
  .sort();
if (!tempFiles.length) {
  console.error(JSON.stringify({ ok: false, error: "No local temp password file" }));
  process.exit(2);
}
const temps = JSON.parse(fs.readFileSync(path.join(secretDir, tempFiles.at(-1)), "utf8"));
const byEmail = new Map((temps.passwords || []).map((p) => [p.email.toLowerCase(), p]));

const require = createRequire(path.resolve("apps/platform-api/package.json"));
const {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AuthFlowType,
  ChallengeNameType,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({ region: REGION });

function newPassword() {
  return `Smk1!${randomBytes(12).toString("base64url").slice(0, 14)}`;
}

async function forceChange(email) {
  const entry = byEmail.get(email.toLowerCase());
  if (!entry?.temporaryPassword) {
    return { email, ok: false, error: "temp password missing in local secret file" };
  }

  const init = await client.send(
    new AdminInitiateAuthCommand({
      UserPoolId: POOL,
      ClientId: CLIENT,
      AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: entry.temporaryPassword,
      },
    }),
  );

  if (init.AuthenticationResult?.AccessToken) {
    return {
      email,
      ok: true,
      alreadyConfirmed: true,
      challenge: null,
      hasAccessToken: true,
    };
  }

  if (
    init.ChallengeName !== ChallengeNameType.NEW_PASSWORD_REQUIRED &&
    init.ChallengeName !== "NEW_PASSWORD_REQUIRED"
  ) {
    return {
      email,
      ok: false,
      error: `Unexpected challenge ${init.ChallengeName || "none"}`,
    };
  }

  const permanent = newPassword();
  const respond = await client.send(
    new AdminRespondToAuthChallengeCommand({
      UserPoolId: POOL,
      ClientId: CLIENT,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: init.Session,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: permanent,
      },
    }),
  );

  if (!respond.AuthenticationResult?.AccessToken) {
    return { email, ok: false, error: "No tokens after NEW_PASSWORD_REQUIRED" };
  }

  return {
    email,
    ok: true,
    alreadyConfirmed: false,
    challenge: "NEW_PASSWORD_REQUIRED",
    hasAccessToken: true,
    _permanent: permanent,
    _subject: respond.AuthenticationResult.IdToken
      ? JSON.parse(
          Buffer.from(respond.AuthenticationResult.IdToken.split(".")[1], "base64url").toString(
            "utf8",
          ),
        ).sub
      : null,
  };
}

const results = [];
const smokeSecrets = [];
for (const email of TARGETS) {
  try {
    const r = await forceChange(email);
    if (r._permanent) {
      smokeSecrets.push({
        email,
        password: r._permanent,
        subject: r._subject,
        setAt: new Date().toISOString(),
        purpose: "H4 login smoke — local only",
      });
      delete r._permanent;
      delete r._subject;
    }
    results.push(r);
  } catch (e) {
    results.push({ email, ok: false, error: e?.name || String(e), message: e?.message });
  }
}

if (smokeSecrets.length) {
  const out = path.join(
    secretDir,
    `staging-smoke-passwords-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    out,
    `${JSON.stringify({ warning: "LOCAL ONLY — do not commit", passwords: smokeSecrets }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

const evidence = {
  ok: results.every((r) => r.ok),
  at: new Date().toISOString(),
  phase: "PRODUCERS-P2-H4-force-change",
  poolId: POOL,
  clientId: CLIENT,
  method: "AdminInitiateAuth ADMIN_USER_PASSWORD_AUTH + NEW_PASSWORD_REQUIRED",
  results,
  note: "Passwords never written to evidence; browser OAuth smoke follows separately.",
};
fs.writeFileSync(
  path.join(EVID, "login-smoke-force-change.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify({ ok: evidence.ok, results: evidence.results }, null, 2));
process.exit(evidence.ok ? 0 : 1);
