#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs, discoverCaller, REPO_ROOT, assertNoSecretsInFile } from "./_lib.mjs";

function walk(dir, files = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (entry.name.endsWith(".json") && !entry.name.includes("evidence-index")) files.push(p);
  }
  return files;
}

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const evidenceRoot = join(REPO_ROOT, "docs", "compliance", "soc2", "evidence");
  const generatedAt = new Date().toISOString();
  const files = walk(evidenceRoot);

  const records = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const meta = parsed.meta || {};
    const body = readFileSync(file);
    const hash = createHash("sha256").update(body).digest("hex");
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    records.push({
      evidence_id: `EVD-${hash.slice(0, 12)}`,
      control_id: meta.control_id || null,
      risk_id: meta.risk_id || null,
      title: meta.title || rel,
      description: meta.source || "compliance evidence artifact",
      period: meta.generated_at || generatedAt,
      environment: meta.environment || args.environment,
      aws_account: meta.aws_account || caller.account,
      aws_region: meta.aws_region || args.region,
      source: meta.source || "scripts/compliance",
      generated_at: meta.generated_at || generatedAt,
      generated_by: "scripts/compliance/build-evidence-index.mjs",
      classification: meta.classification || "Confidential",
      storage_location: rel,
      integrity_hash: hash,
      review_status: meta.review_status || "GENERATED",
      reviewed_by: null,
      reviewed_at: null,
      expiration_or_retention: "Per retention.auditLogsDays / securityLogsDays",
      exceptions: [],
    });
  }

  const index = {
    generated_at: generatedAt,
    environment: args.environment,
    aws_account: caller.account,
    aws_region: args.region,
    review_note: "Automation must not mark evidence ACCEPTED",
    records,
  };

  const jsonPath = join(evidenceRoot, "evidence-index.json");
  const mdPath = join(evidenceRoot, "evidence-index.md");
  writeFileSync(jsonPath, `${JSON.stringify(index, null, 2)}\n`);
  assertNoSecretsInFile(jsonPath);

  const lines = [
    "# Evidence index",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Evidence ID | Control | Title | Status | Location |",
    "| --- | --- | --- | --- | --- |",
    ...records.map(
      (r) =>
        `| ${r.evidence_id} | ${r.control_id || ""} | ${r.title} | ${r.review_status} | \`${r.storage_location}\` |`,
    ),
    "",
  ];
  writeFileSync(mdPath, lines.join("\n"));
  console.log(JSON.stringify({ ok: true, count: records.length, jsonPath, mdPath }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
