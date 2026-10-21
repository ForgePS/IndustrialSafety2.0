#!/usr/bin/env node
/**
 * Create or rotate forge-{env}-secrets-web-push-vapid without printing key material.
 *
 * Usage:
 *   node scripts/ensure-web-push-vapid-secret.mjs --env development
 *   node scripts/ensure-web-push-vapid-secret.mjs --env production --allow-production
 *
 * JSON shape: { publicKey, privateKey, subject }
 * Does not call get-secret-value / does not log secret values.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? null : args[envIndex + 1];
const ALLOW_PRODUCTION = args.includes("--allow-production");
const ROTATE = args.includes("--rotate");

if (!forgeEnvironment || !["development", "production"].includes(forgeEnvironment)) {
  console.error(
    "Usage: node scripts/ensure-web-push-vapid-secret.mjs --env <development|production> [--rotate] [--allow-production]",
  );
  process.exit(1);
}
if (forgeEnvironment === "production" && !ALLOW_PRODUCTION) {
  console.error("Refusing production without --allow-production");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRequire = createRequire(path.join(__dirname, "..", "apps", "platform-api", "package.json"));
const {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  DescribeSecretCommand,
} = apiRequire("@aws-sdk/client-secrets-manager");
const webpush = apiRequire("web-push");

const secretName = `forge-${forgeEnvironment}-secrets-web-push-vapid`;
const subject =
  process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:security@forgepublicsafety.com";
const region = process.env.AWS_REGION || "us-east-1";
const client = new SecretsManagerClient({ region });

let exists = false;
let existingArn = "";
try {
  const described = await client.send(new DescribeSecretCommand({ SecretId: secretName }));
  exists = true;
  existingArn = described.ARN || "";
} catch (err) {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  if (name !== "ResourceNotFoundException") throw err;
}

if (exists && !ROTATE) {
  console.log(
    JSON.stringify({
      status: "exists",
      secretName,
      arn: existingArn,
      rotated: false,
    }),
  );
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const payload = JSON.stringify({
  publicKey: keys.publicKey,
  privateKey: keys.privateKey,
  subject,
});

let arn = existingArn;
if (exists && ROTATE) {
  const put = await client.send(
    new PutSecretValueCommand({ SecretId: secretName, SecretString: payload }),
  );
  arn = put.ARN || existingArn;
} else {
  const created = await client.send(
    new CreateSecretCommand({
      Name: secretName,
      Description: "Web Push VAPID keys for Forge (publicKey, privateKey, subject)",
      SecretString: payload,
    }),
  );
  arn = created.ARN || "";
}

// Keep CLI describe in sync for operators (ARN only).
spawnSync(
  "aws",
  ["secretsmanager", "describe-secret", "--secret-id", secretName, "--query", "Name", "--output", "text"],
  { encoding: "utf8", shell: true },
);

console.log(
  JSON.stringify({
    status: exists ? "rotated" : "created",
    secretName,
    arn,
    keysPresent: ["publicKey", "privateKey", "subject"],
    subject,
  }),
);
