#!/usr/bin/env node
/**
 * Apply Sneat-themed Cognito Hosted UI (classic) branding.
 *
 * Defaults to production pool. Dry-run prints the target; pass APPLY=1 to write.
 *
 *   node scripts/apply-cognito-hosted-ui-sneat.mjs
 *   APPLY=1 node scripts/apply-cognito-hosted-ui-sneat.mjs
 *   FORGE_ENV=development APPLY=1 node scripts/apply-cognito-hosted-ui-sneat.mjs
 *
 * Optional:
 *   CLIENT_ID=ALL|app-client-id   (default ALL)
 *   USER_POOL_ID=us-east-1_xxx    (overrides CloudFormation export)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const CSS_PATH = path.join(repoRoot, "infrastructure/cognito-hosted-ui/sneat-hosted-ui.css");
const LOGO_JPG = path.join(repoRoot, "infrastructure/cognito-hosted-ui/forge-logo.jpg");
const LOGO_PNG = path.join(repoRoot, "infrastructure/cognito-hosted-ui/forge-logo.png");
// Prefer PNG so the Hosted UI logo can keep a transparent background.
const LOGO_PATH = existsSync(LOGO_PNG) ? LOGO_PNG : LOGO_JPG;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const FORGE_ENV = (process.env.FORGE_ENV || "production").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "ALL").trim();

function awsText(args) {
  // shell:false so JMESPath `[0]` is not mangled by cmd.exe on Windows.
  const result = spawnSync("aws", [...args, "--output", "text"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "aws command failed");
  }
  return result.stdout
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "None") ?? "";
}

function resolveUserPoolId() {
  if (process.env.USER_POOL_ID?.trim()) return process.env.USER_POOL_ID.trim();
  const exportName =
    FORGE_ENV === "production"
      ? "Forge-Production-Identity:ForgeIdentity-UserPoolId"
      : "ForgeIdentity-UserPoolId";
  const value = awsText([
    "cloudformation",
    "list-exports",
    "--query",
    `Exports[?Name==\`${exportName}\`].Value | [0]`,
  ]);
  if (!value || value === "None") {
    throw new Error(`Could not resolve user pool id from export ${exportName}`);
  }
  return value;
}

if (!existsSync(CSS_PATH)) throw new Error(`Missing CSS: ${CSS_PATH}`);
if (!existsSync(LOGO_PATH)) throw new Error(`Missing logo: ${LOGO_PATH}`);

const css = readFileSync(CSS_PATH, "utf8");
const userPoolId = resolveUserPoolId();

const summary = {
  apply: APPLY,
  forgeEnv: FORGE_ENV,
  userPoolId,
  clientId: CLIENT_ID,
  cssPath: CSS_PATH,
  logoPath: LOGO_PATH,
  cssBytes: Buffer.byteLength(css, "utf8"),
  logoBytes: readFileSync(LOGO_PATH).length,
};

console.log(JSON.stringify(summary, null, 2));

if (!APPLY) {
  console.log("Dry-run only. Re-run with APPLY=1 to update Cognito Hosted UI.");
  process.exit(0);
}

const result = spawnSync(
  "aws",
  [
    "cognito-idp",
    "set-ui-customization",
    "--user-pool-id",
    userPoolId,
    "--client-id",
    CLIENT_ID,
    "--css",
    css,
    "--image-file",
    `fileb://${LOGO_PATH}`,
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: false, maxBuffer: 10 * 1024 * 1024 },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const parsed = JSON.parse(result.stdout || "{}");
console.log(
  JSON.stringify(
    {
      ok: true,
      clientId: parsed.UICustomization?.ClientId ?? CLIENT_ID,
      cssVersion: parsed.UICustomization?.CSSVersion,
      imageUrl: parsed.UICustomization?.ImageUrl,
      lastModified: parsed.UICustomization?.LastModifiedDate,
    },
    null,
    2,
  ),
);
