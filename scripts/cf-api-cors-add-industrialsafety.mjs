/**
 * Add forgeindustrialsafety vanity origins to the production API CloudFront
 * response headers CORS policy (OriginOverride=true — ECS CORS alone is not enough).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const POLICY_ID = "94d1cf3f-045e-466e-a471-0053d8d7012b";
const ADD = [
  "https://*.forgeindustrialsafety.com",
  "https://producersrice.forgeindustrialsafety.com",
];

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return JSON.parse(r.stdout);
}

const raw = awsJson([
  "cloudfront",
  "get-response-headers-policy",
  "--id",
  POLICY_ID,
  "--output",
  "json",
]);
const etag = raw.ETag;
const cfg = raw.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const origins = [...(cfg.CorsConfig.AccessControlAllowOrigins.Items ?? [])];
for (const o of ADD) {
  if (!origins.includes(o)) origins.push(o);
}
cfg.CorsConfig.AccessControlAllowOrigins = { Quantity: origins.length, Items: origins };

const cfgPath = ".tmp-api-rhp-config.json";
fs.writeFileSync(cfgPath, JSON.stringify(cfg));

const updated = awsJson([
  "cloudfront",
  "update-response-headers-policy",
  "--id",
  POLICY_ID,
  "--if-match",
  etag,
  "--response-headers-policy-config",
  `file://${cfgPath.replace(/\\/g, "/")}`,
  "--output",
  "json",
]);

const after =
  updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.CorsConfig.AccessControlAllowOrigins
    .Items;
console.log(
  JSON.stringify(
    {
      policyId: POLICY_ID,
      hasWildcard: after.includes("https://*.forgeindustrialsafety.com"),
      hasProducers: after.includes("https://producersrice.forgeindustrialsafety.com"),
      origins: after,
    },
    null,
    2,
  ),
);
