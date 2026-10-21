#!/usr/bin/env node
/**
 * Pull recent platform-api INTERNAL failures from CloudWatch.
 */
import { spawnSync } from "node:child_process";

const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";
const start = Date.now() - 3 * 60 * 60 * 1000;

function awsJson(args) {
  const out = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (out.status !== 0) {
    throw new Error(out.stderr || out.stdout || "aws failed");
  }
  return JSON.parse(out.stdout || "{}");
}

const patterns = ["unhandled exception", "INTERNAL_ERROR", "tracks_first_aid", "column", "Failed query"];

const all = [];
for (const pattern of patterns) {
  try {
    const res = awsJson([
      "logs",
      "filter-log-events",
      "--log-group-name",
      LOG_GROUP,
      "--start-time",
      String(start),
      "--filter-pattern",
      pattern,
      "--limit",
      "15",
      "--output",
      "json",
    ]);
    for (const ev of res.events || []) {
      all.push({ pattern, message: ev.message, ts: ev.timestamp });
    }
  } catch (e) {
    all.push({ pattern, error: String(e.message || e) });
  }
}

all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
console.log(JSON.stringify(all.slice(0, 40), null, 2));
