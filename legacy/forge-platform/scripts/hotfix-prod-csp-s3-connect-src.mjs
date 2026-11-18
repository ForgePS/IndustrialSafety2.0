#!/usr/bin/env node
/**
 * Hotfix production SPA CSP connect-src to allow presigned S3 document uploads.
 *
 * Messaging (and training/DQF/etc.) XHR PUT to the documents bucket was blocked
 * because connect-src only listed API + Cognito + Office — not S3.
 *
 * Updates Response Headers Policies on industrial + field distributions in place
 * (no full Frontend CDK deploy).
 *
 * Usage: node scripts/hotfix-prod-csp-s3-connect-src.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const S3_CONNECT = [
  "https://*.s3.us-east-1.amazonaws.com",
  "https://*.s3.amazonaws.com",
  "https://s3.us-east-1.amazonaws.com",
  "https://s3.amazonaws.com",
];

/** App key → CloudFront distribution id (production). Industrial is fixed; field is resolved. */
const DISTRIBUTIONS = {
  industrial: "E364CHF9M9794T",
};

function awsJson(args) {
  return JSON.parse(
    execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
      encoding: "utf8",
    }),
  );
}

function awsText(args) {
  return execFileSync("aws", [...args, "--region", REGION, "--output", "text"], {
    encoding: "utf8",
  }).trim();
}

function parseConnectSrc(csp) {
  const m = csp.match(/connect-src ([^;]+)/i);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

function withS3ConnectSrc(csp) {
  const parts = csp
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  let found = false;
  const next = parts.map((part) => {
    if (!/^connect-src\b/i.test(part)) return part;
    found = true;
    const tokens = new Set(
      part
        .replace(/^connect-src\s+/i, "")
        .split(/\s+/)
        .filter(Boolean),
    );
    for (const host of S3_CONNECT) tokens.add(host);
    return `connect-src ${[...tokens].join(" ")}`;
  });
  if (!found) {
    next.push(`connect-src 'self' ${S3_CONNECT.join(" ")}`);
  }
  return next.join("; ");
}

function resolveFieldDistributionId() {
  try {
    const id = awsText([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "Forge-Production-Frontend",
      "--query",
      "Stacks[0].Outputs[?contains(OutputKey, `Field`) && contains(OutputKey, `DistributionId`)].OutputValue | [0]",
    ]);
    if (id && id !== "None") return id;
  } catch {
    // fall through
  }
  try {
    const list = awsJson(["cloudfront", "list-distributions"]);
    const items = list.DistributionList?.Items ?? [];
    const byAlias = items.find((d) =>
      (d.Aliases?.Items ?? []).some((a) => String(a).startsWith("field.")),
    );
    if (byAlias?.Id) return byAlias.Id;
    const byComment = items.find((d) =>
      /Forge Field Web \(production\)/i.test(String(d.Comment ?? "")),
    );
    return byComment?.Id ?? null;
  } catch {
    return null;
  }
}

function patchDistribution(label, distId) {
  const raw = awsJson(["cloudfront", "get-distribution-config", "--id", distId]);
  const cfg = raw.DistributionConfig;
  const rhpId = cfg.DefaultCacheBehavior?.ResponseHeadersPolicyId;
  if (!rhpId) throw new Error(`${label}: missing ResponseHeadersPolicyId`);

  const rhpRaw = awsJson(["cloudfront", "get-response-headers-policy", "--id", rhpId]);
  const rhpEtag = rhpRaw.ETag;
  const rhpCfg = structuredClone(rhpRaw.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
  delete rhpCfg.ResponseHeadersPolicyId;

  const current = rhpCfg.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";
  if (!current) throw new Error(`${label}: empty CSP on policy ${rhpId}`);

  const before = parseConnectSrc(current);
  const updated = withS3ConnectSrc(current);
  const after = parseConnectSrc(updated);
  const added = S3_CONNECT.filter((h) => after.includes(h) && !before.includes(h));

  if (added.length === 0 && S3_CONNECT.every((h) => before.includes(h))) {
    console.log(`${label} (${distId}): CSP already has S3 connect-src — skip`);
    return { distId, rhpId, skipped: true };
  }

  if (!rhpCfg.SecurityHeadersConfig) rhpCfg.SecurityHeadersConfig = {};
  rhpCfg.SecurityHeadersConfig.ContentSecurityPolicy = {
    Override: true,
    ContentSecurityPolicy: updated,
  };

  // Keep same policy name required by Update API
  const tmp = path.join(process.cwd(), `.forge-csp-s3-${label}-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(rhpCfg, null, 2));
  try {
    awsText([
      "cloudfront",
      "update-response-headers-policy",
      "--id",
      rhpId,
      "--if-match",
      rhpEtag,
      "--response-headers-policy-config",
      `file://${tmp.replace(/\\/g, "/")}`,
    ]);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }

  console.log(
    `${label} (${distId}): updated RHP ${rhpId}; added ${added.length ? added.join(" ") : "(normalized)"}`,
  );
  return { distId, rhpId, skipped: false, added };
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing: account ${identity.Account} != ${ACCOUNT}`);
}

const fieldId = resolveFieldDistributionId();
const targets = [["industrial", DISTRIBUTIONS.industrial]];
if (fieldId) targets.push(["field", fieldId]);
else console.warn("Skipping field: could not resolve distribution id");

const results = [];
for (const [label, distId] of targets) {
  if (!distId || distId === "None") {
    console.warn(`Skipping ${label}: no distribution id`);
    continue;
  }
  results.push({ label, ...patchDistribution(label, distId) });
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
console.log("Hard-refresh Industrial/Field after CloudFront propagates (~1–2 min).");
