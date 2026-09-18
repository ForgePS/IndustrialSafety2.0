/**
 * Add producers-rice-mill.forgepublicsafety.com alias to Industrial CF (dark).
 * Uses existing *.forgepublicsafety.com ACM cert. Does not create DNS records
 * (no Route53 hosted zone in this account).
 *
 * FIS-L02: Keep this legacy alias so existing bookmarks/links resolve. Industrial
 * CloudFront Function 301s this host to producersrice.forgepublicsafety.com and
 * strips OAuth/session query params. Do not delete the alias.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIST_ID = "EXIC8HBMJ4I2Z";
const NEW_ALIAS = "producers-rice-mill.forgepublicsafety.com";
const EVID = path.resolve(
  "docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra",
);

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `aws ${args[0]} failed`);
  }
  return JSON.parse(r.stdout);
}

fs.mkdirSync(EVID, { recursive: true });

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
fs.writeFileSync(
  path.join(EVID, "cf-industrial-config-before.json"),
  `${JSON.stringify(got, null, 2)}\n`,
);

const aliases = cfg.Aliases?.Items ?? [];
if (!aliases.includes(NEW_ALIAS)) {
  aliases.push(NEW_ALIAS);
}
cfg.Aliases = { Quantity: aliases.length, Items: aliases };

const tmp = path.join(EVID, "cf-industrial-config-update.json");
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
fs.writeFileSync(path.join(EVID, "cf-industrial-config-after.json"), upd.stdout);

const dnsNote = {
  at: new Date().toISOString(),
  distributionId: DIST_ID,
  domainName: "d2ed3566n8x2gi.cloudfront.net",
  aliasAdded: NEW_ALIAS,
  certificateArn:
    "arn:aws:acm:us-east-1:511343547817:certificate/ca267baa-304e-4ffd-be51-7350abab0c3f",
  certificateCovers: ["forgepublicsafety.com", "*.forgepublicsafety.com"],
  note:
    "No Route53 hosted zone in account 511343547817. Create CNAME at DNS owner: producers-rice-mill.forgepublicsafety.com -> d2ed3566n8x2gi.cloudfront.net (or alias record). Nested *.industrial.* hostname abandoned for TLS wildcard limits.",
  status: "CF_ALIAS_DARK_DNS_PENDING",
};
fs.writeFileSync(
  path.join(EVID, "dns-producers-rice-mill-dark.json"),
  `${JSON.stringify(dnsNote, null, 2)}\n`,
);
console.log(JSON.stringify(dnsNote, null, 2));
