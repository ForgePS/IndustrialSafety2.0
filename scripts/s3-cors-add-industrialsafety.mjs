import { spawnSync } from "node:child_process";
import fs from "node:fs";

const BUCKET = "forge-production-documents-511343547817-us-east-1";
const NEW_ORIGIN = "https://*.forgeindustrialsafety.com";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "aws failed");
  }
  return JSON.parse(r.stdout);
}

const current = awsJson(["s3api", "get-bucket-cors", "--bucket", BUCKET, "--output", "json"]);
const rule = current.CORSRules?.[0];
if (!rule) throw new Error("No CORS rules on bucket");

const origins = new Set(rule.AllowedOrigins ?? []);
origins.add(NEW_ORIGIN);
rule.AllowedOrigins = [...origins].sort();

const config = { CORSRules: [rule] };
const tmp = ".tmp-s3-documents-cors.json";
fs.writeFileSync(tmp, JSON.stringify(config));

spawnSync(
  "aws",
  ["s3api", "put-bucket-cors", "--bucket", BUCKET, "--cors-configuration", `file://${tmp.replace(/\\/g, "/")}`],
  { encoding: "utf8", shell: true, stdio: "inherit" },
);

const after = awsJson(["s3api", "get-bucket-cors", "--bucket", BUCKET, "--output", "json"]);
console.log(
  JSON.stringify(
    {
      hasIndustrialSafety: (after.CORSRules?.[0]?.AllowedOrigins ?? []).includes(NEW_ORIGIN),
      origins: after.CORSRules?.[0]?.AllowedOrigins ?? [],
    },
    null,
    2,
  ),
);
