/** QR link target type for the Emergency Alerts SMS self-service signup page. */
export const EMERGENCY_SMS_SIGNUP_QR_TARGET = "EMERGENCY_SMS_SIGNUP";

/** Bump when the consent wording changes; stored with every signed consent record. */
export const EMERGENCY_SMS_CONSENT_VERSION = "2026-09-v1";

export const EMERGENCY_SMS_CONSENT_TEXT = [
  "I authorize transactional emergency and safety SMS alerts (evacuation, shelter-in-place, severe weather, all-clear, and drills) to the SMS Notification number shown below.",
  "Message frequency varies with emergencies. Message and data rates may apply. Reply STOP to cancel or HELP for help at any time.",
  "Terms: https://forgepublicsafety.com/terms — Privacy: https://forgepublicsafety.com/privacy",
].join("\n\n");

export type EmergencySmsConsentAction = "AUTHORIZED" | "REVOKED";
export type EmergencySmsConsentMethod = "QR_SELF_SERVICE" | "ADMIN";
