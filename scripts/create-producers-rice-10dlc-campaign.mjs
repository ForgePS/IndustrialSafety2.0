#!/usr/bin/env node
/**
 * Create + submit US 10DLC campaign registration: "Producers Rice Mill"
 * Linked to existing brand registration-0c0ee25650f6433fa73f4c7cd5bfbab0
 *
 * Usage: node scripts/create-producers-rice-10dlc-campaign.mjs
 *        node scripts/create-producers-rice-10dlc-campaign.mjs --submit
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const REGION = "us-east-1";
const BRAND_REGISTRATION_ID = "registration-0c0ee25650f6433fa73f4c7cd5bfbab0";
const submit = process.argv.includes("--submit");

function aws(args, { json = true } = {}) {
  const out = execFileSync("aws", [...args, "--region", REGION, ...(json ? ["--output", "json"] : [])], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return json ? JSON.parse(out || "{}") : out;
}

function putText(registrationId, fieldPath, textValue) {
  return aws([
    "pinpoint-sms-voice-v2",
    "put-registration-field-value",
    "--registration-id",
    registrationId,
    "--field-path",
    fieldPath,
    "--text-value",
    textValue,
  ]);
}

function putSelect(registrationId, fieldPath, choices) {
  return aws([
    "pinpoint-sms-voice-v2",
    "put-registration-field-value",
    "--registration-id",
    registrationId,
    "--field-path",
    fieldPath,
    "--select-choices",
    ...choices,
  ]);
}

console.log("Creating US_TEN_DLC_CAMPAIGN_REGISTRATION…");
const created = aws([
  "pinpoint-sms-voice-v2",
  "create-registration",
  "--registration-type",
  "US_TEN_DLC_CAMPAIGN_REGISTRATION",
  "--tags",
  "Key=Name,Value=ProducersRiceMill",
  "Key=Tenant,Value=producers-rice-mill",
  "Key=Purpose,Value=EmergencyAlerts",
]);
const registrationId = created.RegistrationId;
console.log("registrationId=", registrationId);

console.log("Associating brand", BRAND_REGISTRATION_ID);
aws([
  "pinpoint-sms-voice-v2",
  "create-registration-association",
  "--registration-id",
  registrationId,
  "--resource-id",
  BRAND_REGISTRATION_ID,
]);

const fields = {
  select: {
    "campaignUseCase.useCase": ["SECURITY_ALERT"],
    "campaignUseCase.subscriberOptIn": ["Yes"],
    "campaignUseCase.subscriberOptOut": ["Yes"],
    "campaignUseCase.subscriberHelp": ["Yes"],
    "campaignUseCase.directLending": ["No"],
    "campaignUseCase.embeddedLink": ["No"],
    "campaignUseCase.embeddedPhone": ["No"],
    "campaignUseCase.ageGated": ["No"],
    "campaignInfo.vertical": ["TECHNOLOGY"],
    "campaignInfo.optInType": ["DIGITAL_FORM"],
    "campaignCapabilities.numberCapabilities": ["SMS"],
    "campaignCapabilities.messageType": ["Transactional"],
  },
  text: {
    "campaignInfo.campaignName":
      "Producers Rice Mill - Forge Industrial Emergency Alerts for facility security and safety notifications to employees.",
    "campaignInfo.termsAndConditionsLink": "https://forgepublicsafety.com/terms",
    "campaignInfo.privacyPolicyLink": "https://forgepublicsafety.com/privacy",
    "campaignInfo.optInWorkflow":
      "Producers Rice Mill employees opt in to Emergency Alerts during digital onboarding and personnel profile updates in Forge Industrial Safety. Authorized HR or safety administrators collect the employee's mobile number and obtain explicit consent to receive transactional emergency and safety SMS (evacuation, shelter-in-place, severe weather, all-clear, and drills). The consent screen identifies Forge Public Safety / Producers Rice Mill as the sender, states message frequency varies with emergencies, discloses that message and data rates may apply, and provides links to https://forgepublicsafety.com/terms and https://forgepublicsafety.com/privacy. Consent is recorded before any emergency SMS is sent. Recipients can reply STOP to opt out or HELP for help at any time.",
    "campaignInfo.optInMessage":
      "Producers Rice Mill Emergency Alerts: You are opted in to receive transactional emergency and safety SMS from Forge Public Safety. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to cancel.",
    "campaignInfo.helpMessage":
      "Producers Rice Mill Emergency Alerts: For help contact admin@forgepublicsafety.com or +18705887841. Msg&data rates may apply. Reply STOP to cancel.",
    "campaignInfo.stopMessage":
      "You are unsubscribed from Producers Rice Mill Emergency Alerts. No more messages will be sent. Reply HELP for help.",
    "messageSamples.messageSample1":
      "Producers Rice Mill EMERGENCY: Evacuate Building A immediately and proceed to Assembly Area 2. This is not a drill. Reply STOP to opt out.",
    "messageSamples.messageSample2":
      "Producers Rice Mill ALERT: Shelter in place. Stay indoors until further notice. Await all-clear from safety team.",
    "messageSamples.messageSample3":
      "Producers Rice Mill ALL CLEAR: The emergency condition has ended. Resume normal operations. Follow supervisor instructions.",
    "messageSamples.messageSample4":
      "[DRILL] Producers Rice Mill: This is a scheduled emergency drill. Evacuate to Assembly Area 1. No real emergency.",
  },
};

for (const [path, choices] of Object.entries(fields.select)) {
  console.log("select", path, choices.join("|"));
  putSelect(registrationId, path, choices);
}
for (const [path, value] of Object.entries(fields.text)) {
  console.log("text", path, value.slice(0, 60) + (value.length > 60 ? "…" : ""));
  putText(registrationId, path, value);
}

const values = aws([
  "pinpoint-sms-voice-v2",
  "describe-registration-field-values",
  "--registration-id",
  registrationId,
]);
fs.writeFileSync(
  ".forge-10dlc-campaign-producers-rice.json",
  JSON.stringify({ registrationId, created, values }, null, 2),
);

let submitted = null;
if (submit) {
  console.log("Submitting registration version…");
  submitted = aws([
    "pinpoint-sms-voice-v2",
    "submit-registration-version",
    "--registration-id",
    registrationId,
  ]);
  console.log("submitted", JSON.stringify(submitted, null, 2));
} else {
  console.log("Dry create only. Re-run with --submit to send to TCR for review.");
}

const all = aws(["pinpoint-sms-voice-v2", "describe-registrations"]);
const mine = (all.Registrations || []).find((r) => r.RegistrationId === registrationId);

console.log(
  JSON.stringify(
    {
      registrationId,
      registrationArn: created.RegistrationArn,
      status: mine?.RegistrationStatus,
      type: mine?.RegistrationType,
      submitted: Boolean(submitted),
      next: submit
        ? "Wait for COMPLETE (can take days/weeks), then request a 10DLC long code and associate it."
        : "Review .forge-10dlc-campaign-producers-rice.json then run with --submit",
    },
    null,
    2,
  ),
);
