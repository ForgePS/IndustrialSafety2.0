#!/usr/bin/env node
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  REPO_ROOT,
} from "./_lib.mjs";
import { join } from "node:path";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const outDir = join(REPO_ROOT, "docs", "compliance", "soc2", "evidence", "access");

  const pools = awsJson(["cognito-idp", "list-user-pools", "--max-results", "20"], args);
  const pool = (pools?.UserPools || []).find((p) =>
    (p.Name || "").includes(`forge-${args.environment}`),
  );
  if (!pool) throw new Error("Cognito user pool not found");

  const detail = awsJson(["cognito-idp", "describe-user-pool", "--user-pool-id", pool.Id], args);
  const clients = awsJson(
    ["cognito-idp", "list-user-pool-clients", "--user-pool-id", pool.Id, "--max-results", "20"],
    args,
  );

  const result = writeEvidenceArtifact({
    outDir,
    basename: "cognito-security-settings",
    data: {
      userPoolId: pool.Id,
      name: pool.Name,
      mfaConfiguration: detail?.UserPool?.MfaConfiguration,
      policies: detail?.UserPool?.Policies,
      autoVerifiedAttributes: detail?.UserPool?.AutoVerifiedAttributes,
      usernameAttributes: detail?.UserPool?.UsernameAttributes,
      accountRecoverySetting: detail?.UserPool?.AccountRecoverySetting,
      clients: (clients?.UserPoolClients || []).map((c) => ({
        ClientId: c.ClientId,
        ClientName: c.ClientName,
      })),
    },
    controlId: "CC-ACC-01",
    title: "Cognito security settings (sanitized)",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws cognito-idp describe-user-pool",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
