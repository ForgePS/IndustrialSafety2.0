/** Normalized SMS provider contract for Emergency Alerts (spec §28). */

export const SMS_PROVIDER_AWS = "AWS_END_USER_MESSAGING" as const;
export const SMS_PROVIDER_STUB = "STUB" as const;

export type EmergencyAlertSmsProviderName =
  typeof SMS_PROVIDER_AWS | typeof SMS_PROVIDER_STUB | string;

export type SmsMessageType = "TRANSACTIONAL" | "PROMOTIONAL";

export type EmergencyAlertSmsConfig = {
  provider: EmergencyAlertSmsProviderName;
  enabled: boolean;
  region: string;
  originationIdentity: string | null;
  configurationSetName: string | null;
  messageType: SmsMessageType;
  dryRun: boolean;
  maxPrice: string | null;
  protectConfigurationId: string | null;
  concurrency: number;
};

export type SmsSendRequest = {
  destinationPhoneNumber: string;
  messageBody: string;
  /** Logged to End User Messaging event destinations (max 5 keys). */
  context?: Record<string, string>;
};

export type SmsSendSuccess = {
  ok: true;
  providerMessageId: string;
  status: "ACCEPTED" | "SENT";
  dryRun: boolean;
};

export type SmsSendFailure = {
  ok: false;
  failureCode: string;
  failureReason: string;
};

export type SmsSendResult = SmsSendSuccess | SmsSendFailure;

export interface EmergencyAlertSmsProvider {
  readonly name: EmergencyAlertSmsProviderName;
  isReady(): boolean;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}
