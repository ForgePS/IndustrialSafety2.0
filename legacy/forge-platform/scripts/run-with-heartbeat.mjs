#!/usr/bin/env node
import { spawn } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Usage: node scripts/run-with-heartbeat.mjs <cmd> [args...]");
  process.exit(1);
}

const child = spawn(cmd, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: process.cwd(),
});

const timer = setInterval(() => {
  console.log(`[heartbeat] ${new Date().toISOString()}`);
}, 10000);

child.on("exit", (code, signal) => {
  clearInterval(timer);
  if (signal) {
    console.error(`Process killed by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
