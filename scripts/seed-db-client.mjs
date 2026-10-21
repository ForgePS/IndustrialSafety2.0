import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");

export function repoRequireFrom(packageJsonPath) {
  return createRequire(join(repoRoot, packageJsonPath));
}

export async function loadPostgres() {
  const dbRequire = repoRequireFrom("packages/database/package.json");
  const href = pathToFileURL(dbRequire.resolve("postgres")).href;
  const mod = await import(href);
  return mod.default ?? mod;
}

export function defaultLocalDatabaseUrl() {
  return "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";
}
