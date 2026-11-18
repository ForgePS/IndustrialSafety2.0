#!/usr/bin/env node
/**
 * Capture tenant-isolation / RLS evidence pointers without embedding secrets.
 * Prefers existing Phase 2 acceptance report + CI artifact references.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgs,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  REPO_ROOT,
} from "./_lib.mjs";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const outDir = join(REPO_ROOT, "docs", "compliance", "soc2", "evidence", "testing");

  const phase2Report = join(REPO_ROOT, "docs", "neris", "phase-2-final-acceptance-report.md");
  const isolationSpec = join(REPO_ROOT, "apps", "rms-web-e2e", "tests", "isolation.spec.ts");
  const rlsScript = join(REPO_ROOT, "scripts", "phase2-verify-rls.mjs");

  const result = writeEvidenceArtifact({
    outDir,
    basename: "tenant-isolation-test-results",
    data: {
      sources: {
        phase2AcceptanceReport: existsSync(phase2Report)
          ? "docs/neris/phase-2-final-acceptance-report.md"
          : null,
        isolationSpec: existsSync(isolationSpec)
          ? "apps/rms-web-e2e/tests/isolation.spec.ts"
          : null,
        rlsVerifyScript: existsSync(rlsScript) ? "scripts/phase2-verify-rls.mjs" : null,
      },
      phase2Decision: existsSync(phase2Report)
        ? readFileSync(phase2Report, "utf8").match(/Decision:\s*\*?\*?([^*\n]+)/i)?.[1] ||
          "see report"
        : "report missing",
      expectedControls: [
        "FORCE RLS active",
        "forge_app cannot BYPASSRLS",
        "cross-tenant read/write fail",
        "missing tenant context fails",
      ],
      note: "Full Playwright re-run may be executed separately; this artifact indexes accepted Phase 2 evidence.",
    },
    controlId: "CC-ISO-01",
    riskId: "R-001",
    title: "Tenant isolation test evidence index",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "docs/neris/phase-2-final-acceptance-report.md + test paths",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
