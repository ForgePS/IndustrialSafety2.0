#!/usr/bin/env node
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  defaultTrailName,
  assertNoSecretsInFile,
} from "./_lib.mjs";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const trailName = defaultTrailName(args.environment);
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);

  const events = awsJson(
    [
      "cloudtrail",
      "lookup-events",
      "--max-results",
      "25",
      "--start-time",
      start.toISOString(),
      "--end-time",
      end.toISOString(),
    ],
    args,
  );

  const summary = (events?.Events || []).map((e) => ({
    EventId: e.EventId,
    EventName: e.EventName,
    EventSource: e.EventSource,
    EventTime: e.EventTime,
    Username: e.Username,
    ReadOnly: e.ReadOnly,
    AccessKeyId: e.AccessKeyId ? "[REDACTED]" : undefined,
    Resources: (e.Resources || []).map((r) => ({
      ResourceType: r.ResourceType,
      ResourceName: r.ResourceName,
    })),
  }));

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "trail-events-summary",
    data: {
      trailName,
      window: { start: start.toISOString(), end: end.toISOString() },
      eventCount: summary.length,
      events: summary,
    },
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudTrail recent events summary (sanitized)",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws cloudtrail lookup-events",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, eventCount: summary.length, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
