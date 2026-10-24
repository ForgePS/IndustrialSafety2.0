import type {
  EmergencyAlertSmsConfig,
  EmergencyAlertSmsProvider,
  SmsSendRequest,
  SmsSendResult,
} from "./emergency-alert-sms.types.js";
import { SMS_PROVIDER_STUB } from "./emergency-alert-sms.types.js";

/** Used when tenant/platform SMS is disabled or not configured. */
export class StubEmergencyAlertSmsProvider implements EmergencyAlertSmsProvider {
  readonly name = SMS_PROVIDER_STUB;

  constructor(private readonly reason = "SMS provider adapter is not configured") {}

  isReady(): boolean {
    return false;
  }

  async send(_request: SmsSendRequest): Promise<SmsSendResult> {
    return {
      ok: false,
      failureCode: "PROVIDER_NOT_CONFIGURED",
      failureReason: this.reason,
    };
  }
}

export function createStubSmsProvider(config: EmergencyAlertSmsConfig): EmergencyAlertSmsProvider {
  if (!config.enabled) {
    return new StubEmergencyAlertSmsProvider("SMS channel is disabled for this tenant");
  }
  if (config.provider === SMS_PROVIDER_STUB) {
    return new StubEmergencyAlertSmsProvider(
      "SMS provider is STUB. Set smsProvider to AWS_END_USER_MESSAGING and configure originationIdentity.",
    );
  }
  return new StubEmergencyAlertSmsProvider(`SMS provider "${config.provider}" is not implemented`);
}
