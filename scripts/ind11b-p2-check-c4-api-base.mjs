/**
 * C4: confirm industrial-web static build API base points at platform API CF.
 */
import fs from "node:fs";
import path from "node:path";

const SITE =
  process.env.FORGE_INDUSTRIAL_SITE_URL || "https://producers-rice-mill.forgepublicsafety.com/";
const EXPECTED = process.env.FORGE_API_BASE_EXPECTED || "https://api-dev.forgepublicsafety.com";
const ALSO_OK = [EXPECTED, "https://d108fstxdv69bo.cloudfront.net"].filter(Boolean);

const html = await (await fetch(SITE)).text();
const chunkPaths = [...html.matchAll(/\/_next\/static\/[^"' )]+/g)].map((m) => m[0]);
const uniqueChunks = [...new Set(chunkPaths)].slice(0, 40);

const found = new Set();
for (const rel of uniqueChunks) {
  try {
    const js = await (await fetch(new URL(rel, SITE))).text();
    for (const m of js.matchAll(/https?:\/\/[a-z0-9._:-]+/gi)) {
      const u = m[0];
      if (/cloudfront|api\.|localhost:4000|forgepublicsafety/i.test(u)) found.add(u);
    }
    if (js.includes(EXPECTED) || js.includes(EXPECTED.replace(/^https:\/\//, ""))) {
      found.add(EXPECTED);
    }
  } catch {
    // ignore chunk fetch errors
  }
}

const urls = [...found].sort();
const ok = urls.some((u) => ALSO_OK.some((e) => u === e || u.startsWith(`${e}/`)));
const out = {
  ok,
  at: new Date().toISOString(),
  site: SITE,
  expectedApiBase: EXPECTED,
  acceptedApiBases: ALSO_OK,
  chunksScanned: uniqueChunks.length,
  apiishUrls: urls,
  note: "localhost:4000 may appear as a compile-time fallback string; runtime uses NEXT_PUBLIC_API_URL.",
};
const evidDir = path.resolve(
  "docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra",
);
fs.mkdirSync(evidDir, { recursive: true });
fs.writeFileSync(
  path.join(evidDir, "c4-industrial-api-base.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 1);
