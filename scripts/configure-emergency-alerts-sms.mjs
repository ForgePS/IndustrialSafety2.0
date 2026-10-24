/**
 * Enable AWS End User Messaging SMS for Emergency Alerts on a tenant.
 *
 * Usage (from repo root, against a running API with auth cookie/token):
 *   node scripts/configure-emergency-alerts-sms.mjs --help
 *
 * Prefer PATCH /api/v1/industrial/emergency-alerts/settings from an admin session.
 * This script is for operators who already have a bearer token.
 *
 * Required AWS side (outside this script):
 * - 10DLC / brand registration (US)
 * - Origination phone number or pool in End User Messaging SMS
 * - Optional configuration set for delivery events
 * - platform-api task role sms-voice:SendTextMessage (CDK)
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "api-url": { type: "string" },
    token: { type: "string" },
    "origination-identity": { type: "string" },
    "configuration-set": { type: "string" },
    "dry-run": { type: "boolean", default: true },
    enable: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values["api-url"] || !values.token || !values["origination-identity"]) {
  console.log(`Configure Emergency Alerts SMS (AWS End User Messaging)

Required:
  --api-url https://api... 
  --token <Bearer access token>
  --origination-identity <+E164 | phone-number-id | pool ARN>

Optional:
  --configuration-set <name>
  --dry-run          (default true — AWS DryRun, no carrier send)
  --enable           set smsEnabled=true (default false)

Example dry-run config:
  node scripts/configure-emergency-alerts-sms.mjs \\
    --api-url https://api-dev.forgepublicsafety.com \\
    --token "$TOKEN" \\
    --origination-identity +15551234567 \\
    --dry-run
`);
  process.exit(values.help ? 0 : 1);
}

const body = {
  smsProvider: "AWS_END_USER_MESSAGING",
  smsEnabled: Boolean(values.enable),
  settings: {
    originationIdentity: values["origination-identity"],
    ...(values["configuration-set"] ? { configurationSetName: values["configuration-set"] } : {}),
    dryRun: values["dry-run"] !== false,
    messageType: "TRANSACTIONAL",
  },
};

const res = await fetch(
  `${String(values["api-url"]).replace(/\/$/, "")}/api/v1/industrial/emergency-alerts/settings`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${values.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);

const text = await res.text();
console.log(res.status, text);
process.exit(res.ok ? 0 : 1);
