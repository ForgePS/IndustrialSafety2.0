/**
 * Flip Producers vanity: 301 old forgepublicsafety hosts →
 * producersrice.forgeindustrialsafety.com on the live industrial CF Function.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const NAME = "forge-production-cffn-industrial-idx";
const CODE_FILE = ".tmp-cffn-industrial-idx.js";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return r.stdout ? JSON.parse(r.stdout) : {};
}

function awsRaw(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return r;
}

// Download LIVE code
awsRaw(["cloudfront", "get-function", "--name", NAME, "--stage", "LIVE", CODE_FILE]);
let code = fs.readFileSync(CODE_FILE, "utf8");

const REDIRECT_SNIPPET = `
  // FIS cutover: permanent redirect for legacy Producers vanity hosts.
  var legacyHosts = {
    'producersrice.forgepublicsafety.com': 'producersrice.forgeindustrialsafety.com',
    'producers-rice-mill.forgepublicsafety.com': 'producersrice.forgeindustrialsafety.com'
  };
  var headers = request.headers;
  var reqHost = (headers['host'] && headers['host'].value || '').toLowerCase();
  var legacyTarget = legacyHosts[reqHost];
  if (legacyTarget) {
    var stripKeys = { 'code': true, 'state': true, 'session_state': true, 'error': true, 'error_description': true };
    var q = request.querystring || {};
    var kept = [];
    for (var key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) continue;
      if (stripKeys[key.toLowerCase()]) continue;
      var entry = q[key];
      if (entry && entry.multiValue) {
        for (var i = 0; i < entry.multiValue.length; i++) {
          kept.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry.multiValue[i].value));
        }
      } else if (entry && entry.value !== undefined) {
        kept.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry.value));
      }
    }
    var loc = 'https://' + legacyTarget + uri + (kept.length ? '?' + kept.join('&') : '');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: loc },
        'cache-control': { value: 'no-store' },
      },
    };
  }
`;

if (code.includes("producersrice.forgeindustrialsafety.com")) {
  // Replace existing legacyHosts map if present
  code = code.replace(
    /var legacyHosts = \{[\s\S]*?\};/,
    `var legacyHosts = {
    'producersrice.forgepublicsafety.com': 'producersrice.forgeindustrialsafety.com',
    'producers-rice-mill.forgepublicsafety.com': 'producersrice.forgeindustrialsafety.com'
  };`,
  );
} else {
  // Insert after `var uri = request.uri;`
  if (!code.includes("var uri = request.uri;")) {
    throw new Error("Unexpected CF function shape — cannot insert redirect");
  }
  code = code.replace(
    "var uri = request.uri;",
    `var uri = request.uri;${REDIRECT_SNIPPET}`,
  );
}

fs.writeFileSync(CODE_FILE, code);

const desc = awsJson([
  "cloudfront",
  "describe-function",
  "--name",
  NAME,
  "--output",
  "json",
]);
const etag = desc.ETag;

const fnConfigPath = ".tmp-cffn-industrial-config.json";
fs.writeFileSync(
  fnConfigPath,
  JSON.stringify({
    Comment: "Industrial directory index + Producers vanity 301 cutover",
    Runtime: "cloudfront-js-2.0",
  }),
);

const updated = awsJson([
  "cloudfront",
  "update-function",
  "--name",
  NAME,
  "--if-match",
  etag,
  "--function-config",
  `file://${fnConfigPath.replace(/\\/g, "/")}`,
  "--function-code",
  `fileb://${CODE_FILE.replace(/\\/g, "/")}`,
  "--output",
  "json",
]);

const newEtag = updated.ETag;
const published = awsJson([
  "cloudfront",
  "publish-function",
  "--name",
  NAME,
  "--if-match",
  newEtag,
  "--output",
  "json",
]);

console.log(
  JSON.stringify(
    {
      name: NAME,
      status: published.FunctionSummary?.Status,
      stage: published.FunctionSummary?.FunctionMetadata?.Stage,
      hasNewTarget: code.includes("producersrice.forgeindustrialsafety.com"),
      hasOldProducersKey: code.includes("'producersrice.forgepublicsafety.com'"),
    },
    null,
    2,
  ),
);
