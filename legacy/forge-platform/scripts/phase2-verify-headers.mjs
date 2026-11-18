#!/usr/bin/env node
/**
 * Phase 2 closeout: verify security / CORS response headers on RMS + API CloudFront.
 *
 * Usage: node scripts/phase2-verify-headers.mjs
 */
import { spawnSync } from "node:child_process";

const HEADER_KEYS = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
  "access-control-allow-origin",
];

const TARGETS = [
  "https://d3ud5uzwd9js2z.cloudfront.net/",
  "https://d108fstxdv69bo.cloudfront.net/health",
  "http://d3ud5uzwd9js2z.cloudfront.net/",
  "http://d108fstxdv69bo.cloudfront.net/health",
];

const GOOD_ORIGIN = "https://d3ud5uzwd9js2z.cloudfront.net";
const BAD_ORIGIN = "https://evil.example";

function curlHeaders(args) {
  const result = spawnSync("curl", ["-sI", ...args], {
    encoding: "utf8",
    shell: true,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status ?? 1,
    stderr: (result.stderr || "").trim(),
    raw: result.stdout || "",
  };
}

function parseResponse(raw) {
  const blocks = raw
    .split(/\r?\n\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const last = blocks[blocks.length - 1] ?? "";
  const lines = last.split(/\r?\n/);
  const statusLine = lines[0] ?? "";
  const statusMatch = statusLine.match(/^HTTP\/\S+\s+(\d+)/i);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const headers = {};
  let location = null;

  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
    if (key === "location") location = value;
  }

  const selected = {};
  for (const key of HEADER_KEYS) {
    selected[key] = headers[key] ?? null;
  }

  return { status, location, headers: selected };
}

function probeHead(url) {
  const { exitCode, stderr, raw } = curlHeaders([url]);
  return {
    url,
    method: "HEAD",
    curlExitCode: exitCode,
    stderr: stderr || null,
    ...parseResponse(raw),
  };
}

function probeOptions(url, origin) {
  const { exitCode, stderr, raw } = curlHeaders([
    "-X",
    "OPTIONS",
    "-H",
    `Origin: ${origin}`,
    "-H",
    "Access-Control-Request-Method: GET",
    "-H",
    "Access-Control-Request-Headers: authorization,content-type",
    url,
  ]);
  return {
    url,
    method: "OPTIONS",
    origin,
    curlExitCode: exitCode,
    stderr: stderr || null,
    ...parseResponse(raw),
  };
}

const apiHttps = "https://d108fstxdv69bo.cloudfront.net/health";

const report = {
  checkedAt: new Date().toISOString(),
  head: TARGETS.map(probeHead),
  cors: {
    goodOrigin: probeOptions(apiHttps, GOOD_ORIGIN),
    badOrigin: probeOptions(apiHttps, BAD_ORIGIN),
  },
};

console.log(JSON.stringify(report, null, 2));
