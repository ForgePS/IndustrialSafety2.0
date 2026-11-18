#!/usr/bin/env node
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  defaultTrailName,
} from "./_lib.mjs";
import { join } from "node:path";
import { REPO_ROOT } from "./_lib.mjs";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const outDir = join(REPO_ROOT, "docs", "compliance", "soc2", "evidence", "logging");
  const prefix = `forge-${args.environment}-alarm-`;
  const alarms = awsJson(["cloudwatch", "describe-alarms", "--alarm-name-prefix", prefix], args);
  const metricFilters = awsJson(
    [
      "logs",
      "describe-metric-filters",
      "--log-group-name",
      `/forge/${args.environment}/cloudtrail`,
    ],
    args,
  );

  const result = writeEvidenceArtifact({
    outDir,
    basename: "cloudwatch-security-alarms",
    data: {
      trailName: defaultTrailName(args.environment),
      alarmPrefix: prefix,
      alarms: (alarms?.MetricAlarms || []).map((a) => ({
        AlarmName: a.AlarmName,
        AlarmDescription: a.AlarmDescription,
        StateValue: a.StateValue,
        MetricName: a.MetricName,
        Namespace: a.Namespace,
        Threshold: a.Threshold,
      })),
      metricFilters: (metricFilters?.metricFilters || []).map((f) => ({
        filterName: f.filterName,
        filterPattern: f.filterPattern,
        metricTransformations: f.metricTransformations,
      })),
    },
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudWatch CloudTrail security alarms and metric filters",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws cloudwatch describe-alarms + logs describe-metric-filters",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
