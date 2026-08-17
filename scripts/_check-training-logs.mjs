import { spawnSync } from "node:child_process";

const end = Date.now();
const start = end - 10 * 60 * 1000;
const r = spawnSync(
  "aws",
  [
    "logs",
    "filter-log-events",
    "--log-group-name",
    "/forge/production/platform-api",
    "--start-time",
    String(start),
    "--end-time",
    String(end),
    "--filter-pattern",
    "industrial_training_records",
    "--max-items",
    "5",
    "--query",
    "events[*].message",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true, env: process.env },
);
console.log(r.stdout || r.stderr || "(no output)");
process.exit(r.status ?? 1);
