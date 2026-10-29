#!/usr/bin/env node
/**
 * Shared helpers for SOC 2 evidence export scripts (Windows-safe).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "..", "..");

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    profile: process.env.AWS_PROFILE || "forge-dev",
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || "us-east-1",
    environment: process.env.FORGE_ENV || "development",
    outDir: join(REPO_ROOT, "docs", "compliance", "soc2", "evidence", "cloudtrail"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") out.profile = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--environment" || a === "--env") out.environment = argv[++i];
    else if (a === "--out") out.outDir = argv[++i];
  }
  return out;
}

export function awsJson(args, { profile, region }) {
  const result = spawnSync(
    "aws",
    [...args, "--profile", profile, "--region", region, "--output", "json"],
    { encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "aws command failed").trim();
    throw new Error(err);
  }
  if (!result.stdout?.trim()) return null;
  return JSON.parse(result.stdout);
}

export function redact(value) {
  if (value == null) return value;
  const json = JSON.stringify(value);
  const redacted = json
    .replace(
      /"(password|secret|SecretString|accessKeyId|secretAccessKey|sessionToken|privateKey|authorization)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"',
    )
    .replace(/:"[A-Za-z0-9+/]{40,}={0,2}"/g, ':"[REDACTED_POSSIBLE_SECRET]"');
  return JSON.parse(redacted);
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function toolVersions() {
  const aws = spawnSync("aws", ["--version"], { encoding: "utf8", shell: true });
  return {
    awsCli: (aws.stdout || aws.stderr || "").trim(),
    node: process.version,
  };
}

export function writeEvidenceArtifact({
  outDir,
  basename,
  data,
  controlId,
  riskId,
  title,
  classification = "Confidential",
  environment,
  account,
  region,
  source,
}) {
  mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const payload = {
    meta: {
      generated_at: generatedAt,
      environment,
      aws_account: account,
      aws_region: region,
      tool_versions: toolVersions(),
      control_id: controlId,
      risk_id: riskId,
      title,
      classification,
      source,
      review_status: "GENERATED",
    },
    data: redact(data),
  };
  const jsonPath = join(outDir, `${basename}.json`);
  const mdPath = join(outDir, `${basename}.md`);
  const jsonBody = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(jsonPath, jsonBody);
  const hash = sha256(jsonBody);
  writeFileSync(join(outDir, `${basename}.sha256`), `${hash}  ${basename}.json\n`);
  const md = `# ${title}

| Field | Value |
| --- | --- |
| Generated at | ${generatedAt} |
| Environment | ${environment} |
| Account | ${account} |
| Region | ${region} |
| Control | ${controlId || "n/a"} |
| Risk | ${riskId || "n/a"} |
| Classification | ${classification} |
| Review status | GENERATED (not ACCEPTED) |
| Integrity SHA-256 | \`${hash}\` |

See \`${basename}.json\` for sanitized machine-readable evidence.
`;
  writeFileSync(mdPath, md);
  return {
    jsonPath,
    mdPath,
    hash,
    generatedAt,
    relativeJson: relative(REPO_ROOT, jsonPath).replace(/\\/g, "/"),
  };
}

export function discoverCaller({ profile, region }) {
  const id = awsJson(["sts", "get-caller-identity"], { profile, region });
  return { account: id.Account, arn: id.Arn, userId: id.UserId };
}

export function defaultTrailName(environment) {
  return `forge-${environment}-cloudtrail-management`;
}

export function assertNoSecretsInFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const forbidden = [/AKIA[0-9A-Z]{16}/, /"password"\s*:\s*"(?!\[REDACTED\])[^"]+"/i];
  for (const re of forbidden) {
    if (re.test(text)) {
      throw new Error(`Potential secret detected in ${filePath}`);
    }
  }
}

export function loadJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
