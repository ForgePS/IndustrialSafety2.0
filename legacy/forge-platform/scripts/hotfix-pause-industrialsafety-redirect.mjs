/**
 * Pause 301s from forgepublicsafety.com → forgeindustrialsafety.com so mill
 * users stay on the established domain (newly registered domain firewalls).
 *
 * Updates LIVE CloudFront function forge-production-cffn-industrial-idx:
 * - Remove redirect of producersrice.forgepublicsafety.com → industrialsafety
 * - Point producers-rice-mill → producersrice.forgepublicsafety.com (if present)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const FUNCTION_NAME = "forge-production-cffn-industrial-idx";
const CODE_PATH = ".forge-cf-industrial-idx-live.js";
const PATCHED_PATH = ".forge-cf-industrial-idx-no-new-domain-301.js";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const meta = JSON.parse(
  sh(`aws cloudfront describe-function --name ${FUNCTION_NAME} --stage LIVE --output json`),
);
const etag = meta.ETag;

sh(`aws cloudfront get-function --name ${FUNCTION_NAME} --stage LIVE ${CODE_PATH}`);
let source = fs.readFileSync(CODE_PATH, "utf8");

if (!source.includes("legacyHosts")) {
  console.log("No legacyHosts block in LIVE function; nothing to change.");
  process.exit(0);
}

// Drop the publicsafety → industrialsafety map entry if present.
source = source.replace(
  /\s*'producersrice\.forgepublicsafety\.com'\s*:\s*'producersrice\.forgeindustrialsafety\.com'\s*,?/g,
  "",
);

// Prefer established domain for hyphenated legacy host.
source = source.replace(
  /'producers-rice-mill\.forgepublicsafety\.com'\s*:\s*'producersrice\.forgeindustrialsafety\.com'/g,
  "'producers-rice-mill.forgepublicsafety.com': 'producersrice.forgepublicsafety.com'",
);

if (source.includes("forgeindustrialsafety.com")) {
  // Still referenced — strip any remaining industrialsafety redirect targets in legacyHosts only.
  source = source.replace(
    /('producers[^']*'\s*:\s*)'producersrice\.forgeindustrialsafety\.com'/g,
    "$1'producersrice.forgepublicsafety.com'",
  );
}

if (source.includes("forgeindustrialsafety.com")) {
  console.error("Patched source still references forgeindustrialsafety.com; aborting.");
  console.error(source.match(/[^\n]*forgeindustrialsafety[^\n]*/g));
  process.exit(1);
}

fs.writeFileSync(PATCHED_PATH, source);

const updated = JSON.parse(
  sh(
    `aws cloudfront update-function --name ${FUNCTION_NAME} --if-match ${etag} --function-config Comment="Industrial SPA directory index + dual-serve (no new-domain 301)",Runtime=cloudfront-js-2.0 --function-code fileb://${PATCHED_PATH} --output json`,
  ),
);

const published = JSON.parse(
  sh(
    `aws cloudfront publish-function --name ${FUNCTION_NAME} --if-match ${updated.ETag} --output json`,
  ),
);

console.log(
  JSON.stringify(
    {
      function: FUNCTION_NAME,
      stage: published.FunctionSummary?.Status ?? "PUBLISHED",
      note: "Use https://producersrice.forgepublicsafety.com/ — no longer 301s to forgeindustrialsafety.com",
    },
    null,
    2,
  ),
);
