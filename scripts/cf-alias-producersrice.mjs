/**
 * Add producersrice.forgepublicsafety.com alias to Industrial CloudFront distribution.
 * Uses existing *.forgepublicsafety.com ACM cert. Does not create DNS records.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIST_ID = process.env.INDUSTRIAL_CF_DIST_ID || "E364CHF9M9794T";
const NEW_ALIASES = [
  "producersrice.forgepublicsafety.com",
  ...(process.env.EXTRA_CF_ALIAS ? [process.env.EXTRA_CF_ALIAS.trim()] : []),
];

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `aws ${args[0]} failed`);
  }
  return JSON.parse(r.stdout);
}

const got = awsJson([
  "cloudfront",
  "get-distribution-config",
  "--id",
  DIST_ID,
  "--output",
  "json",
]);
const etag = got.ETag;
const cfg = got.DistributionConfig;

const aliases = [...(cfg.Aliases?.Items ?? [])];
for (const alias of NEW_ALIASES) {
  if (!aliases.includes(alias)) aliases.push(alias);
}
cfg.Aliases = { Quantity: aliases.length, Items: aliases };

const tmp = path.join(process.cwd(), ".tmp-cf-industrial-alias-update.json");
fs.writeFileSync(tmp, JSON.stringify(cfg));

const upd = spawnSync(
  "aws",
  [
    "cloudfront",
    "update-distribution",
    "--id",
    DIST_ID,
    "--if-match",
    etag,
    "--distribution-config",
    `file://${tmp.replace(/\\/g, "/")}`,
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
if (upd.status !== 0) {
  console.error(upd.stderr || upd.stdout);
  process.exit(1);
}

const note = {
  at: new Date().toISOString(),
  distributionId: DIST_ID,
  domainName: got.Distribution?.DomainName ?? cfg.Origins?.Items?.[0]?.DomainName,
  aliasesAdded: NEW_ALIASES.filter((a) => !(got.DistributionConfig?.Aliases?.Items ?? []).includes(a)),
  aliases,
  note:
    "Create CNAME at DNS owner: producersrice.forgepublicsafety.com -> CloudFront domain above.",
};
console.log(JSON.stringify(note, null, 2));
