#!/usr/bin/env node
/**
 * Producers P2 Phase 2 — read-only Firebase Auth export for one business.
 *
 * Requires:
 *   FORGE_P2_AUTH_EXPORT_AUTHORIZED=true
 *   FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH=... (never commit SA JSON)
 *
 * No Cognito writes. No password hash extraction.
 *
 *   node scripts/ind11b-p2-auth-export-producers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const BUSINESS_ID = "business-1782553339499";
const PROJECT_ID = "forge-industrial-safety";
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_AUTH_EXPORT_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_AUTH_EXPORT_AUTHORIZED=true after signing APPROVE-PRODUCERS-AUTH-EXPORT.md",
  );
}

const saPath = process.env.FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH?.trim();
if (!saPath) {
  fail("FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH required");
}
if (!fs.existsSync(saPath)) {
  fail(`Service account file missing: ${saPath}`);
}

const requireFromMig = createRequire(path.resolve("packages/migration-firebase/package.json"));
let admin;
let getAuth;
try {
  admin = requireFromMig("firebase-admin");
  getAuth = requireFromMig("firebase-admin/auth").getAuth;
} catch (e) {
  fail(`firebase-admin not found under packages/migration-firebase: ${e}`);
}

const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
if (!sa.private_key || !sa.client_email) {
  fail("Service account JSON missing private_key or client_email");
}

const root = admin;
const appName = `p2-auth-export-${Date.now()}`;
const certFn = root.credential?.cert ?? root.cert;
if (typeof certFn !== "function" || typeof root.initializeApp !== "function") {
  fail(`firebase-admin API unexpected (cert=${typeof certFn}, init=${typeof root.initializeApp})`);
}
if (typeof getAuth !== "function") {
  fail("firebase-admin/auth getAuth unavailable");
}
const app = root.initializeApp(
  {
    credential: certFn.call(root.credential ?? root, sa),
    projectId: PROJECT_ID,
  },
  appName,
);

function claimsBusinessIds(claims) {
  const out = [];
  if (!claims || typeof claims !== "object") return out;
  if (typeof claims.businessId === "string") out.push(claims.businessId);
  if (Array.isArray(claims.businessIds)) {
    for (const b of claims.businessIds) if (typeof b === "string") out.push(b);
  }
  if (Array.isArray(claims.businesses)) {
    for (const b of claims.businesses) if (typeof b === "string") out.push(b);
  }
  return [...new Set(out)];
}

function roleHints(claims) {
  const hints = [];
  if (!claims || typeof claims !== "object") return hints;
  for (const key of ["role", "roles", "permissionTemplate", "permissionTemplates"]) {
    const v = claims[key];
    if (typeof v === "string") hints.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") hints.push(x);
  }
  return [...new Set(hints)];
}

function belongsToProducers(businessIds) {
  return businessIds.includes(BUSINESS_ID);
}

async function main() {
  const auth = getAuth(app);
  const freezeAt = new Date().toISOString();
  const stamp = freezeAt.replace(/[:.]/g, "-");

  const allUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const claims = u.customClaims ?? {};
      const businessIds = claimsBusinessIds(claims);
      allUsers.push({
        uid: u.uid,
        email: u.email ?? null,
        emailVerified: Boolean(u.emailVerified),
        displayName: u.displayName ?? null,
        disabled: Boolean(u.disabled),
        providers: (u.providerData || []).map((p) => p.providerId),
        businessIds,
        roleHints: roleHints(claims),
        claimKeys: Object.keys(claims).sort(),
        createdAt: u.metadata?.creationTime ?? null,
        lastSignInAt: u.metadata?.lastSignInTime ?? null,
        inProducers: belongsToProducers(businessIds),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const producers = allUsers.filter((u) => u.inProducers);
  const exceptions = {
    missingEmail: producers.filter((u) => !u.email).map((u) => u.uid),
    disabled: producers.filter((u) => u.disabled).map((u) => ({ uid: u.uid, email: u.email })),
    multiBusiness: producers
      .filter((u) => u.businessIds.length > 1)
      .map((u) => ({ uid: u.uid, email: u.email, businessIds: u.businessIds })),
    duplicateEmails: [],
    producersriceEmailNoClaim: allUsers
      .filter(
        (u) =>
          !u.inProducers && typeof u.email === "string" && /@producersrice\.com$/i.test(u.email),
      )
      .map((u) => ({ uid: u.uid, email: u.email, businessIds: u.businessIds })),
  };

  const byEmail = new Map();
  for (const u of producers) {
    const key = (u.email || "").trim().toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(u.uid);
  }
  for (const [email, uids] of byEmail) {
    if (uids.length > 1) exceptions.duplicateEmails.push({ email, uids });
  }

  const roster = {
    ok: true,
    phase: "PRODUCERS-P2-auth-export",
    freezeAt,
    firebaseProject: PROJECT_ID,
    firebaseBusinessId: BUSINESS_ID,
    authorization: {
      gate: "FORGE_P2_AUTH_EXPORT_AUTHORIZED",
      approval: "evidence/p2/02-cognito/APPROVE-PRODUCERS-AUTH-EXPORT.md",
      signed: true,
    },
    passwordHashes: "NOT_EXPORTED",
    counts: {
      authUsersTotal: allUsers.length,
      producersMatched: producers.length,
      producersDisabled: exceptions.disabled.length,
      producersMissingEmail: exceptions.missingEmail.length,
      producersMultiBusiness: exceptions.multiBusiness.length,
      duplicateEmails: exceptions.duplicateEmails.length,
      producersriceEmailNoClaim: exceptions.producersriceEmailNoClaim.length,
    },
    users: producers
      .map((u) => ({
        uid: u.uid,
        email: u.email,
        emailNormalized: u.email ? u.email.trim().toLowerCase() : null,
        emailVerified: u.emailVerified,
        displayName: u.displayName,
        disabled: u.disabled,
        providers: u.providers,
        businessIds: u.businessIds,
        roleHints: u.roleHints,
        claimKeys: u.claimKeys,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
      }))
      .sort((a, b) =>
        String(a.emailNormalized || a.uid).localeCompare(String(b.emailNormalized || b.uid)),
      ),
    exceptions,
  };

  fs.mkdirSync(EVID_DIR, { recursive: true });
  const rosterPath = path.join(EVID_DIR, `roster-export-${stamp}.json`);
  const summaryPath = path.join(EVID_DIR, "roster-count-summary.json");
  const latestPath = path.join(EVID_DIR, "roster-export-latest.json");

  fs.writeFileSync(rosterPath, `${JSON.stringify(roster, null, 2)}\n`);
  fs.writeFileSync(latestPath, `${JSON.stringify(roster, null, 2)}\n`);
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        ok: true,
        freezeAt,
        firebaseBusinessId: BUSINESS_ID,
        counts: roster.counts,
        rosterFile: path.basename(rosterPath),
        exceptionsPreview: {
          missingEmail: exceptions.missingEmail.length,
          disabled: exceptions.disabled.length,
          multiBusiness: exceptions.multiBusiness.slice(0, 20),
          duplicateEmails: exceptions.duplicateEmails,
          producersriceEmailNoClaim: exceptions.producersriceEmailNoClaim,
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        freezeAt,
        counts: roster.counts,
        rosterFile: rosterPath,
        summaryFile: summaryPath,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
    process.exit(1);
  })
  .finally(async () => {
    try {
      await root.deleteApp(app);
    } catch {
      /* ignore */
    }
  });
