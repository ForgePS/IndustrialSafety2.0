/**
 * Production hotfix: add first-party vanity-host CORS origins to the API
 * CloudFront response headers policy. CloudFront originOverride=true means the
 * edge policy (not Nest) is what the browser sees.
 *
 * Usage: node scripts/hotfix-prod-api-cors-vanity.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const POLICY_ID = "94d1cf3f-045e-466e-a471-0053d8d7012b";
const EXTRA = [
  "https://*.forgepublicsafety.com",
  "https://producers-rice-mill.forgepublicsafety.com",
];

function awsJson(args) {
  const out = execFileSync("aws", args, {
    encoding: "utf8",
    env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || "forge-dev" },
  });
  return JSON.parse(out);
}

const current = awsJson([
  "cloudfront",
  "get-response-headers-policy",
  "--id",
  POLICY_ID,
]);
const etag = current.ETag;
const cfg = current.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const items = [
  ...new Set([
    ...(cfg.CorsConfig.AccessControlAllowOrigins.Items ?? []),
    ...EXTRA,
  ]),
];
cfg.CorsConfig.AccessControlAllowOrigins.Items = items;
cfg.CorsConfig.AccessControlAllowOrigins.Quantity = items.length;

const path = join(tmpdir(), `forge-rhp-${POLICY_ID}.json`);
writeFileSync(path, JSON.stringify(cfg));
try {
  const updated = awsJson([
    "cloudfront",
    "update-response-headers-policy",
    "--id",
    POLICY_ID,
    "--if-match",
    etag,
    "--response-headers-policy-config",
    `file://${path.replace(/\\/g, "/")}`,
  ]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        policyId: POLICY_ID,
        origins:
          updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.CorsConfig
            .AccessControlAllowOrigins.Items,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}
