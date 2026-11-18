import { describe, expect, it } from "vitest";
import {
  buildSmsMessageBody,
  isSmsProviderReady,
  resolveEmergencyAlertSmsConfig,
  toE164Phone,
} from "./resolve-sms-provider.js";
import { SMS_PROVIDER_AWS, SMS_PROVIDER_STUB } from "./emergency-alert-sms.types.js";

describe("emergency alert SMS helpers", () => {
  it("converts US snapshots to E.164", () => {
    expect(toE164Phone("5015551212")).toBe("+15015551212");
    expect(toE164Phone("15015551212")).toBe("+15015551212");
    expect(toE164Phone("+1 (501) 555-1212")).toBe("+15015551212");
    expect(toE164Phone("123")).toBeNull();
  });

  it("prefixes drill messages", () => {
    expect(buildSmsMessageBody({ shortMessage: "Evacuate now", isDrill: true })).toBe(
      "[DRILL] Evacuate now",
    );
    expect(buildSmsMessageBody({ shortMessage: "Evacuate now", isDrill: false })).toBe(
      "Evacuate now",
    );
  });

  it("resolves AWS config from tenant settings over env defaults", () => {
    const config = resolveEmergencyAlertSmsConfig(
      {
        AWS_REGION: "us-east-1",
        SMS_ORIGINATION_IDENTITY: "+15550001111",
        SMS_DRY_RUN: "true",
      },
      {
        smsProvider: SMS_PROVIDER_AWS,
        smsEnabled: true,
        settingsJson: {
          originationIdentity: "arn:aws:sms-voice:us-east-1:123:pool/abc",
          dryRun: false,
          concurrency: 3,
        },
      },
    );
    expect(config.provider).toBe(SMS_PROVIDER_AWS);
    expect(config.originationIdentity).toBe("arn:aws:sms-voice:us-east-1:123:pool/abc");
    expect(config.dryRun).toBe(false);
    expect(config.concurrency).toBe(3);
    expect(isSmsProviderReady(config)).toBe(true);
  });

  it("is not ready when stubbed or missing origination", () => {
    expect(
      isSmsProviderReady(
        resolveEmergencyAlertSmsConfig(
          { AWS_REGION: "us-east-1" },
          { smsProvider: SMS_PROVIDER_STUB, smsEnabled: true, settingsJson: {} },
        ),
      ),
    ).toBe(false);
    expect(
      isSmsProviderReady(
        resolveEmergencyAlertSmsConfig(
          { AWS_REGION: "us-east-1" },
          { smsProvider: SMS_PROVIDER_AWS, smsEnabled: true, settingsJson: {} },
        ),
      ),
    ).toBe(false);
  });

  it("SMS_DRY_RUN env enables dry-run when settings omit dryRun (demo containment)", () => {
    const config = resolveEmergencyAlertSmsConfig(
      {
        AWS_REGION: "us-east-1",
        SMS_ORIGINATION_IDENTITY: "+15550001111",
        SMS_DRY_RUN: "true",
      },
      {
        smsProvider: SMS_PROVIDER_AWS,
        smsEnabled: true,
        settingsJson: { originationIdentity: "+15550001111" },
      },
    );
    expect(config.dryRun).toBe(true);
    expect(isSmsProviderReady(config)).toBe(true);
  });
});
