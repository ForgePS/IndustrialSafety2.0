/**
 * READ-ONLY: confirm deployed bootstrap kill-switch logic + PERSONNEL awsEnabled simulation
 * using the same FeatureFlagsService semantics as the API.
 */
import { readFileSync, existsSync } from "node:fs";

const paths = [
  "/app/apps/platform-api/dist/modules/industrial/industrial-bootstrap.service.js",
  "/app/apps/platform-api/dist/src/modules/industrial/industrial-bootstrap.service.js",
];

const found = [];
for (const p of paths) {
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  found.push({
    path: p,
    hasDeploymentEnabled: src.includes("deploymentEnabled"),
    hasOldFlagMap: src.includes("flagMap"),
    snippet: src.includes("deploymentEnabled")
      ? "NEW_kill_switch_logic"
      : src.includes("Boolean(flagMap")
        ? "OLD_flagMap_logic"
        : "UNKNOWN",
  });
}

// Also scan dist tree briefly
import { spawnSync } from "node:child_process";
const rg = spawnSync(
  "sh",
  ["-c", "find /app/apps/platform-api/dist -name '*bootstrap*' 2>/dev/null | head -20"],
  { encoding: "utf8" },
);

console.log(
  JSON.stringify(
    {
      found,
      findBootstrap: (rg.stdout || "").trim().split("\n").filter(Boolean),
    },
    null,
    2,
  ),
);
