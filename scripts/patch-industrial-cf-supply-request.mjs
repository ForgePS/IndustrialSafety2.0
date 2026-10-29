import fs from "node:fs";
import { spawnSync } from "node:child_process";

const fnPath = "scripts/_cf-industrial-idx.js";
const configPath = "scripts/_cf-fn-config.json";
const name = "forge-production-cffn-industrial-idx";

let code = fs.readFileSync(fnPath, "utf8").replace(/\r\n/g, "\n");
if (!code.includes("safety-supplies")) {
  const anchor =
    "  var trainingAccessMatch = uri.match(/^\\/training\\/access\\/([^/]+)\\/?$/);\n  if (trainingAccessMatch) {\n    var accessSegment = trainingAccessMatch[1];\n    if (accessSegment !== 'placeholder') {\n      request.uri = '/training/access/placeholder/index.html';\n      return request;\n    }\n  }\n";
  if (!code.includes(anchor)) {
    console.error("anchor not found");
    const start = code.indexOf("trainingAccessMatch");
    console.error(JSON.stringify(code.slice(start, start + 280)));
    process.exit(1);
  }
  const insert = `${anchor}  var supplyRequestMatch = uri.match(/^\\/safety-supplies\\/request\\/q\\/([^/]+)\\/?$/);
  if (supplyRequestMatch) {
    var supplyRequestSegment = supplyRequestMatch[1];
    if (supplyRequestSegment !== 'placeholder') {
      request.uri = '/safety-supplies/request/q/placeholder/index.html';
      return request;
    }
  }
  var supplyStatusMatch = uri.match(/^\\/safety-supplies\\/request\\/status\\/([^/]+)\\/?$/);
  if (supplyStatusMatch) {
    var supplyStatusSegment = supplyStatusMatch[1];
    if (supplyStatusSegment !== 'placeholder') {
      request.uri = '/safety-supplies/request/status/placeholder/index.html';
      return request;
    }
  }
  var industrialScanMatch = uri.match(/^\\/scan\\/([^/]+)\\/?$/);
  if (industrialScanMatch) {
    var industrialScanSegment = industrialScanMatch[1];
    if (industrialScanSegment !== 'placeholder' && industrialScanSegment !== 'equipment') {
      request.uri = '/scan/placeholder/index.html';
      return request;
    }
  }
`;
  code = code.replace(anchor, insert);
  fs.writeFileSync(fnPath, code);
  console.log("patched function code", code.length);
} else {
  console.log("function already includes safety-supplies rewrite");
}

fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      Comment: "Rewrite directory URIs to index.html for Industrial Web",
      Runtime: "cloudfront-js-2.0",
    },
    null,
    2,
  ),
);

function awsJson(args) {
  const res = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  return JSON.parse(res.stdout);
}

function aws(args) {
  const res = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  return res.stdout;
}

const described = awsJson(["cloudfront", "describe-function", "--name", name, "--output", "json"]);
console.log("update if-match", described.ETag);
aws([
  "cloudfront",
  "update-function",
  "--name",
  name,
  "--if-match",
  described.ETag,
  "--function-config",
  `file://${configPath}`,
  "--function-code",
  `fileb://${fnPath}`,
]);

const updated = awsJson(["cloudfront", "describe-function", "--name", name, "--output", "json"]);
console.log("publish if-match", updated.ETag);
aws(["cloudfront", "publish-function", "--name", name, "--if-match", updated.ETag]);
console.log("published", name);
