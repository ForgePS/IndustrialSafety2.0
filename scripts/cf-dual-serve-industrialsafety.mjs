/**
 * Attach multi-SAN ACM cert (both forge zones) to Industrial CloudFront and
 * ensure producersrice.forgeindustrialsafety.com is an alias. Additive only.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const DIST_ID = process.env.INDUSTRIAL_CF_DIST_ID || "E364CHF9M9794T";
const CERT_ARN =
  process.env.INDUSTRIAL_DUAL_SERVE_CERT_ARN ||
  "arn:aws:acm:us-east-1:511343547817:certificate/9f1513cd-5496-4bca-a5a1-8e9a56b8d9b4";
const REQUIRED_ALIASES = [
  "producersrice.forgeindustrialsafety.com",
  "producersrice.forgepublicsafety.com",
  "producers-rice-mill.forgepublicsafety.com",
  "industrial.forgepublicsafety.com",
];

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "aws failed");
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

const aliases = new Set(cfg.Aliases?.Items ?? []);
for (const a of REQUIRED_ALIASES) aliases.add(a);
cfg.Aliases = { Quantity: aliases.size, Items: [...aliases].sort() };

cfg.ViewerCertificate = {
  CloudFrontDefaultCertificate: false,
  ACMCertificateArn: CERT_ARN,
  SSLSupportMethod: "sni-only",
  MinimumProtocolVersion: "TLSv1.2_2021",
  Certificate: CERT_ARN,
  CertificateSource: "acm",
};

const tmp = ".tmp-cf-industrial-dual-serve.json";
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
  { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 },
);
if (upd.status !== 0) {
  console.error(upd.stderr || upd.stdout);
  process.exit(1);
}

const after = JSON.parse(upd.stdout);
console.log(
  JSON.stringify(
    {
      distributionId: DIST_ID,
      domainName: after.Distribution?.DomainName,
      status: after.Distribution?.Status,
      aliases: after.Distribution?.DistributionConfig?.Aliases?.Items,
      certificateArn: after.Distribution?.DistributionConfig?.ViewerCertificate?.ACMCertificateArn,
      dnsCname:
        "producersrice.forgeindustrialsafety.com -> " +
        (after.Distribution?.DomainName || "d1n0e5wvjwbpdf.cloudfront.net"),
    },
    null,
    2,
  ),
);
