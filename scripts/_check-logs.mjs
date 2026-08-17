import { spawnSync } from "node:child_process";

const end = Date.now();
const start = end - Number(process.argv[3] ?? 15) * 60 * 1000;
const pattern = process.argv[2] ?? "training";
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
    pattern,
    "--max-items",
    "20",
    "--query",
    "events[*].message",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true, env: process.env, maxBuffer: 64 * 1024 * 1024 },
);
console.log(r.stdout || r.stderr || "(no output)");
process.exit(r.status ?? 1);
