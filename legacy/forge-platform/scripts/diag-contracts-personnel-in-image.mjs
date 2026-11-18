/**
 * Probe PERSONNEL entry inside contracts bundled in the running platform-api image.
 */
import { pathToFileURL } from "node:url";

const candidates = [
  "/app/packages/contracts/dist/industrial.js",
  "/app/node_modules/@forge/contracts/dist/industrial.js",
  "/app/apps/platform-api/node_modules/@forge/contracts/dist/industrial.js",
];

let loaded = null;
for (const p of candidates) {
  try {
    const mod = await import(pathToFileURL(p).href);
    if (mod?.INDUSTRIAL_MODULE_REGISTRY) {
      loaded = { path: p, registry: mod.INDUSTRIAL_MODULE_REGISTRY };
      break;
    }
  } catch (e) {
    /* continue */
  }
}

const personnel = (loaded?.registry || []).find((m) => m.code === "PERSONNEL");
const firstAid = (loaded?.registry || []).find((m) => m.code === "FIRST_AID");
console.log(
  JSON.stringify(
    {
      path: loaded?.path ?? null,
      registryCount: loaded?.registry?.length ?? 0,
      personnel,
      firstAid,
      codesSample: (loaded?.registry || []).slice(0, 8).map((m) => m.code),
    },
    null,
    2,
  ),
);
